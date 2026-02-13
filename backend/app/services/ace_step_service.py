from __future__ import annotations

import logging
import os
import sys
import threading
import wave
from array import array
from io import BytesIO
from dataclasses import dataclass
from typing import Callable, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)


ProgressCb = Callable[[int, str], None]


@dataclass
class AceStepGenerateParams:
    prompt: str
    lyrics: Optional[str]
    duration: int
    sample_rate: int = 44100


class AceStepNotInstalledError(RuntimeError):
    pass


# Handler manager to initialize and reuse handlers
_handler_lock = threading.Lock()
_dit_handler = None
_llm_handler = None
_handlers_initialized = False


def _get_project_root() -> str:
    """Get the ACE-Step project root directory."""
    # Try to get from environment first
    project_root = os.getenv("ACESTEP_PROJECT_ROOT")
    if project_root:
        return os.path.abspath(project_root)
    
    # Default: assume acestepapp is in backend/
    # This file is in backend/app/services/, so go up to backend/ then to acestepapp/
    current_file = os.path.abspath(__file__)
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_file)))
    acestepapp_dir = os.path.join(backend_dir, "acestepapp")
    
    if os.path.exists(acestepapp_dir):
        return acestepapp_dir
    
    # Fallback: use settings model dir parent
    settings = get_settings()
    model_dir = os.path.abspath(settings.ace_step_model_dir)
    # If model_dir is like "models/ace-step-1.5", go up to find project root
    if "checkpoints" in os.listdir(os.path.dirname(model_dir)) if os.path.exists(os.path.dirname(model_dir)) else False:
        return os.path.dirname(model_dir)
    
    return os.path.dirname(model_dir)


def _is_celery_worker() -> bool:
    """Check if we're running in a Celery worker process."""
    # Check for Celery worker process indicators
    try:
        import multiprocessing
        # Check if we're in a forked process (Celery uses fork by default)
        if multiprocessing.current_process().name != "MainProcess":
            return True
    except Exception:
        pass
    
    # Check environment variables that Celery sets
    if os.getenv("CELERY_WORKER_NAME") or os.getenv("FORKED_BY_MULTIPROCESSING"):
        return True
    
    # Check process name (psutil is optional)
    try:
        import psutil
        current_process = psutil.Process()
        process_name = current_process.name().lower()
        if "celery" in process_name or "worker" in process_name:
            return True
    except ImportError:
        # psutil not installed, skip process name check
        pass
    except Exception:
        # Other errors, skip
        pass
    
    return False


def _get_safe_device() -> str:
    """
    Get device setting, but force CPU for MPS in Celery workers to avoid crashes.
    MPS has known issues with forked processes (Celery's default pool type).
    """
    device = (os.getenv("ACESTEP_DEVICE") or get_settings().ace_step_device or "auto").lower()
    
    # If MPS is requested but we're in a Celery worker, fall back to CPU
    # MPS crashes with SIGABRT in forked processes due to XPC connection issues
    if device == "mps" and _is_celery_worker():
        logger.warning(
            "[ace_step_service] MPS device requested but running in Celery worker. "
            "Falling back to CPU to avoid MPS crashes in forked processes. "
            "Set ACESTEP_DEVICE=cpu to suppress this warning."
        )
        return "cpu"
    
    return device


def _ensure_handlers_initialized(progress_cb: Optional[ProgressCb] = None) -> tuple:
    """Initialize and return DiT and LLM handlers. Thread-safe singleton."""
    global _dit_handler, _llm_handler, _handlers_initialized
    
    with _handler_lock:
        if _handlers_initialized and _dit_handler is not None:
            return _dit_handler, _llm_handler
        
        # Import here to avoid errors if acestep is not installed
        try:
            # Add project root to path for imports
            project_root = _get_project_root()
            if project_root not in sys.path:
                sys.path.insert(0, project_root)
            
            from acestep.handler import AceStepHandler
            from acestep.llm_inference import LLMHandler
        except ImportError as e:
            raise AceStepNotInstalledError(
                "ACE-Step python package not found. Install the ACE-Step repo as a python package.\n"
                f"Project root: {project_root}\n"
                f"Error: {str(e)}"
            ) from e
        
        if progress_cb:
            progress_cb(10, "ace-step: initializing handlers")
        
        # Initialize DiT handler
        project_root = _get_project_root()
        checkpoint_dir = os.path.join(project_root, "checkpoints")
        config_path = os.getenv("ACESTEP_CONFIG_PATH", "acestep-v15-turbo")
        device = _get_safe_device()
        
        if progress_cb:
            progress_cb(12, "ace-step: initializing DiT")
        
        _dit_handler = AceStepHandler()
        status_dit, ok_dit = _dit_handler.initialize_service(
            project_root=project_root,
            config_path=config_path,
            device=device,
            use_flash_attention=True,
            compile_model=False,
        )
        
        if not ok_dit:
            raise AceStepNotInstalledError(f"DiT initialization failed: {status_dit}")
        
        if progress_cb:
            progress_cb(15, "ace-step: DiT ready")
        
        # Initialize LLM handler (optional)
        _llm_handler = LLMHandler()
        lm_model = os.getenv("ACESTEP_LM_MODEL_PATH", "acestep-5Hz-lm-0.6B")
        lm_backend = os.getenv("ACESTEP_LM_BACKEND", "vllm")
        
        if progress_cb:
            progress_cb(17, "ace-step: initializing LLM")
        
        status_llm, ok_llm = _llm_handler.initialize(
            checkpoint_dir=checkpoint_dir,
            lm_model_path=lm_model,
            backend=lm_backend,
            device=device,
        )
        
        if ok_llm:
            if progress_cb:
                progress_cb(20, "ace-step: LLM ready")
        else:
            if progress_cb:
                progress_cb(20, f"ace-step: LLM init failed (optional): {status_llm}")
        
        _handlers_initialized = True
        return _dit_handler, _llm_handler


def _default_model_dir() -> str:
    settings = get_settings()
    # Make it robust regardless of backend cwd
    return os.path.abspath(settings.ace_step_model_dir)


def _write_wav_bytes(*, audio_f32, sample_rate: int) -> bytes:
    """
    Write mono float audio in [-1, 1] to 16-bit PCM WAV bytes.

    Accepts:
    - torch.Tensor (1D/2D)
    - list/tuple/iterable of floats
    """
    # Torch is optional; only handle it if present.
    if hasattr(audio_f32, "detach") and hasattr(audio_f32, "cpu"):
        t = audio_f32.detach().cpu().float()
        # Downmix / squeeze common shapes
        if hasattr(t, "ndim") and t.ndim == 2:
            if t.shape[0] == 1:
                t = t[0]
            elif t.shape[1] == 1:
                t = t[:, 0]
            else:
                t = t.mean(dim=0)
        audio_list = t.clamp(-1.0, 1.0).tolist()
    else:
        # Try to interpret as a flat iterable
        audio_list = list(audio_f32)

    pcm = array("h")
    for x in audio_list:
        try:
            xf = float(x)
        except Exception:
            xf = 0.0
        if xf > 1.0:
            xf = 1.0
        elif xf < -1.0:
            xf = -1.0
        pcm.append(int(xf * 32767.0))

    buf = BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # int16
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


def _read_audio_file_to_wav_bytes(audio_path: str) -> bytes:
    """Read an audio file (mp3, wav, flac, etc.) and convert to WAV bytes."""
    # Use torchaudio for MP3 files (soundfile doesn't support MP3)
    # For WAV/FLAC, we can use either torchaudio or soundfile
    try:
        import torchaudio
        import numpy as np
    except ImportError:
        raise AceStepNotInstalledError(
            "torchaudio is required to read audio files. Install with: pip install torchaudio"
        )
    
    # Read audio file using torchaudio (supports MP3, WAV, FLAC, etc.)
    try:
        audio_tensor, sample_rate = torchaudio.load(audio_path)
    except Exception as e:
        # Fallback: try soundfile for WAV/FLAC if torchaudio fails
        if audio_path.endswith(".wav") or audio_path.endswith(".flac"):
            try:
                import soundfile as sf
                audio_data, sample_rate = sf.read(audio_path)
                # Convert numpy array directly (we'll process as numpy)
                if len(audio_data.shape) == 1:
                    audio_np = audio_data.reshape(1, -1)  # [1, samples]
                else:
                    audio_np = audio_data.T  # [channels, samples]
            except ImportError:
                raise AceStepNotInstalledError(
                    "soundfile is required as fallback. Install with: pip install soundfile"
                )
        else:
            raise RuntimeError(f"Failed to load audio file {audio_path}: {str(e)}") from e
    else:
        # Convert tensor to numpy for processing
        # audio_tensor is [channels, samples] format
        audio_np = audio_tensor.cpu().numpy()
    
    # Process numpy array (from either torchaudio or soundfile)
    
    # Convert to mono if stereo (average channels)
    if audio_np.shape[0] > 1:
        audio_data = np.mean(audio_np, axis=0)  # Average across channels
    else:
        audio_data = audio_np[0]  # Take first (and only) channel
    
    # Ensure audio is in [-1, 1] range (torchaudio already normalizes to this range)
    audio_data = np.clip(audio_data, -1.0, 1.0).astype(np.float32)
    
    # Convert to 16-bit PCM
    pcm = array("h")
    for x in audio_data:
        xf = float(x)
        pcm.append(int(xf * 32767.0))
    
    # Write WAV bytes
    buf = BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # int16
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


def generate_wav_bytes(params: AceStepGenerateParams, *, progress_cb: Optional[ProgressCb] = None) -> bytes:
    """
    ACE-Step 1.5 local inference using generate_music from acestep.inference.

    This uses the official ACE-Step pipeline with GenerationParams and GenerationConfig.
    Official reference: https://github.com/ace-step/ACE-Step-1.5
    """
    logger.info(f"[ace_step_service] generate_wav_bytes called: prompt='{params.prompt[:50]}...', duration={params.duration}s")
    if params.lyrics:
        logger.info(f"[ace_step_service] Lyrics provided: {params.lyrics[:100]}...")
    else:
        logger.info("[ace_step_service] No lyrics provided (instrumental)")

    # Check PyTorch is available
    try:
        import torch  # type: ignore
    except Exception as e:
        raise AceStepNotInstalledError(
            "ACE-Step runtime requires PyTorch. Install torch for macOS (MPS) and add ACE-Step as a local dependency.\n"
            "Reference: https://github.com/ace-step/ACE-Step-1.5"
        ) from e
    
    # Import generate_music and related classes
    project_root = _get_project_root()
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    
    try:
        from acestep.inference import (
            GenerationParams,
            GenerationConfig,
            generate_music,
        )
    except ImportError as e:
        raise AceStepNotInstalledError(
            "ACE-Step inference module not found. Install the ACE-Step repo as a python package.\n"
            f"Project root: {project_root}\n"
            f"Error: {str(e)}"
        ) from e
    
    # Initialize handlers
    dit_handler, llm_handler = _ensure_handlers_initialized(progress_cb)
    
    # Check if LLM is available for thinking/CoT
    llm_available = llm_handler is not None and hasattr(llm_handler, "llm_initialized") and llm_handler.llm_initialized
    
    # Create save directory for output
    project_root = _get_project_root()
    save_dir = os.getenv("ACESTEP_SAVE_DIR", os.path.join(project_root, "output"))
    os.makedirs(save_dir, exist_ok=True)
    
    if progress_cb:
        progress_cb(25, "ace-step: preparing generation parameters")
    
    # Map request parameters to GenerationParams
    generation_params = GenerationParams(
        task_type="text2music",
        caption=params.prompt,
        lyrics=params.lyrics or "",
        instrumental=not bool(params.lyrics),
        vocal_language="en",  # Default to English, can be auto-detected if LLM is available
        bpm=None,  # Auto-detect
        keyscale="",  # Auto-detect
        timesignature="",  # Auto-detect
        duration=float(params.duration) if params.duration > 0 else -1.0,
        inference_steps=8,  # Turbo model default
        seed=-1,  # Random seed
        thinking=llm_available,  # Enable CoT if LLM is available
        use_cot_metas=llm_available,
        use_cot_caption=llm_available,
        use_cot_language=llm_available,
    )
    
    # Create GenerationConfig
    generation_config = GenerationConfig(
        batch_size=1,
        use_random_seed=True,  # Use random seed
        seeds=None,  # Will be random
        audio_format="mp3",  # Save as MP3, we'll convert to WAV
    )
    
    # Progress callback wrapper
    # ACE-Step calls progress(value: float, desc: str = "")
    def _progress_wrapper(value: float, desc: str = "", **kwargs):
        if not progress_cb:
            return
        # Map ACE-Step progress (0.0 to 1.0) into [25, 85]
        # Clamp value to [0.0, 1.0] range
        value = max(0.0, min(1.0, float(value)))
        pct = 25 + int(value * 60)
        progress_cb(pct, desc or "ace-step: generating")
    
    if progress_cb:
        progress_cb(30, "ace-step: generating music")
    
    # Generate music
    try:
        logger.info("=" * 80)
        logger.info("Generating music!!!!!!!!!!")
        logger.info(f"Prompt: {params.prompt}")
        logger.info(f"Duration: {params.duration}s")
        logger.info("=" * 80)
        
        result = generate_music(
            dit_handler=dit_handler,
            llm_handler=llm_handler,
            params=generation_params,
            config=generation_config,
            save_dir=save_dir,
            progress=_progress_wrapper,
        )
    except Exception as e:
        raise AceStepNotInstalledError(
            f"ACE-Step generation failed: {str(e)}"
        ) from e
    
    if not result.success:
        logger.error(f"[ace_step_service] Generation failed: {result.error or 'Unknown error'}")
        raise RuntimeError(f"Generation failed: {result.error or 'Unknown error'}")
    
    if not result.audios:
        logger.error("[ace_step_service] Generation succeeded but no audio files were produced")
        raise RuntimeError("Generation succeeded but no audio files were produced")
    
    logger.info(f"[ace_step_service] Generation succeeded! Produced {len(result.audios)} audio file(s)")
    
    if progress_cb:
        progress_cb(85, "ace-step: reading audio file")
    
    # Get the first audio file path
    first_audio = result.audios[0]
    audio_path = first_audio.get("path")
    
    logger.info(f"[ace_step_service] Reading audio file: {audio_path}")
    
    if not audio_path or not os.path.exists(audio_path):
        logger.error(f"[ace_step_service] Generated audio file not found: {audio_path}")
        raise RuntimeError(f"Generated audio file not found: {audio_path}")
    
    # Read audio file and convert to WAV bytes
    try:
        wav_bytes = _read_audio_file_to_wav_bytes(audio_path)
        logger.info(f"[ace_step_service] Successfully read audio file, size: {len(wav_bytes)} bytes")
    except Exception as e:
        logger.error(f"[ace_step_service] Failed to read audio file: {str(e)}")
        # Fallback: try to read as raw bytes if it's already WAV
        if audio_path.endswith(".wav"):
            with open(audio_path, "rb") as f:
                wav_bytes = f.read()
            logger.info(f"[ace_step_service] Fallback: read WAV as raw bytes, size: {len(wav_bytes)} bytes")
        else:
            raise RuntimeError(f"Failed to read audio file: {str(e)}") from e
    
    if progress_cb:
        progress_cb(90, "ace-step: done")
    
    logger.info("[ace_step_service] generate_wav_bytes completed successfully")
    return wav_bytes
    try:
        sig = inspect.signature(entry)
    except Exception:
        sig = None

    def _accepts(name: str) -> bool:
        if sig is None:
            return True
        return name in sig.parameters

    def _progress_bridge(step: int, total: int | None = None, msg: str | None = None):
        if not progress_cb:
            return
        # Map "generation" into [25, 85]
        if total and total > 0:
            pct = 25 + int((step / total) * 60)
            progress_cb(pct, msg or f"ace-step: step {step}/{total}")
        else:
            progress_cb(50, msg or "ace-step: generating")

    if progress_cb:
        progress_cb(15, "ace-step: loading model")

    kwargs = {}
    # prompt / lyrics
    if _accepts("prompt"):
        kwargs["prompt"] = params.prompt
    if _accepts("lyrics"):
        kwargs["lyrics"] = params.lyrics
    # duration
    for k in ("duration", "duration_sec", "seconds"):
        if _accepts(k):
            kwargs[k] = params.duration
            break
    # sample rate
    for k in ("sample_rate", "sr"):
        if _accepts(k):
            kwargs[k] = params.sample_rate
            break
    # model dir / device
    for k in ("model_dir", "ckpt_dir", "checkpoint_dir", "weights_dir"):
        if _accepts(k):
            kwargs[k] = model_dir
            break
    if _accepts("device"):
        kwargs["device"] = device

    # progress / callback (common names)
    for k in ("progress_cb", "callback", "progress_callback", "on_progress", "step_callback"):
        if _accepts(k):
            kwargs[k] = _progress_bridge
            break

    if progress_cb:
        progress_cb(25, "ace-step: generating")

    try:
        out = entry(**kwargs)
    except TypeError as e:
        raise AceStepNotInstalledError(
            "ACE-Step entrypoint was found but could not be called with the expected arguments.\n"
            f"Resolved entrypoint: {getattr(entry, '__module__', '?')}:{getattr(entry, '__name__', str(entry))}\n"
            f"Adapter tried kwargs: {sorted(kwargs.keys())}\n"
            "Fix by setting env ACE_STEP_ENTRYPOINT to the correct callable or adjust the adapter."
        ) from e

    # Normalize output -> wav bytes.
    # Common patterns:
    #   - returns wav bytes directly
    #   - returns (audio, sample_rate)
    #   - returns dict with 'audio'/'wav_bytes' keys
    if isinstance(out, (bytes, bytearray)):
        if progress_cb:
            progress_cb(85, "ace-step: done")
        return bytes(out)

    audio = None
    sr = params.sample_rate
    if isinstance(out, tuple) and len(out) >= 1:
        audio = out[0]
        if len(out) >= 2 and isinstance(out[1], (int, float)):
            sr = int(out[1])
    elif isinstance(out, dict):
        if out.get("wav_bytes") is not None:
            if progress_cb:
                progress_cb(85, "ace-step: done")
            return bytes(out["wav_bytes"])
        audio = out.get("audio") or out.get("waveform") or out.get("samples")
        if out.get("sample_rate") is not None or out.get("sr") is not None:
            sr = int(out.get("sample_rate") or out.get("sr"))
    else:
        audio = out

    if audio is None:
        raise RuntimeError("ACE-Step output could not be converted to wav bytes")

    if progress_cb:
        progress_cb(80, "ace-step: encoding wav")
    wav_bytes = _write_wav_bytes(audio_f32=audio, sample_rate=sr)
    if progress_cb:
        progress_cb(85, "ace-step: done")
    return wav_bytes


