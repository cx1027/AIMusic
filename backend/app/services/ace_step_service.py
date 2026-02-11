from __future__ import annotations

import importlib
import inspect
import os
import wave
from array import array
from io import BytesIO
from dataclasses import dataclass
from typing import Callable, Optional

from app.core.config import get_settings


ProgressCb = Callable[[int, str], None]


@dataclass
class AceStepGenerateParams:
    prompt: str
    lyrics: Optional[str]
    duration: int
    sample_rate: int = 44100


class AceStepNotInstalledError(RuntimeError):
    pass


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


def _import_callable(dotted: str):
    """
    Import a callable from 'module:attr' or 'module.attr'.
    """
    if ":" in dotted:
        mod, attr = dotted.split(":", 1)
    else:
        mod, attr = dotted.rsplit(".", 1)
    m = importlib.import_module(mod)
    fn = getattr(m, attr, None)
    if fn is None or not callable(fn):
        raise ImportError(f"Entry point '{dotted}' is not callable")
    return fn


def _resolve_ace_step_entrypoint():
    """
    Resolve ACE-Step entrypoint callable.

    Priority:
      1) env ACE_STEP_ENTRYPOINT (e.g. 'ace_step.inference:generate')
      2) known candidates (best-effort)
    """
    override = os.environ.get("ACE_STEP_ENTRYPOINT")
    if override:
        return _import_callable(override)

    candidates = [
        # Best-effort guesses; upstream may differ. Users can override via ACE_STEP_ENTRYPOINT.
        "ace_step.inference:generate",
        "ace_step.inference:infer",
        "ace_step.pipeline:generate",
        "ace_step.pipeline:infer",
        "acestep.inference:generate",
        "acestep.pipeline:generate",
    ]
    last_err: Exception | None = None
    for c in candidates:
        try:
            return _import_callable(c)
        except Exception as e:
            last_err = e
            continue
    raise AceStepNotInstalledError(
        "ACE-Step python package entrypoint not found. Install the ACE-Step repo as a python package, "
        "or set env ACE_STEP_ENTRYPOINT to the correct callable.\n"
        "Examples:\n"
        "  ACE_STEP_ENTRYPOINT=ace_step.inference:generate\n"
        "  ACE_STEP_ENTRYPOINT=acestep.pipeline:infer\n"
        f"Model dir: {os.environ.get('ACE_STEP_MODEL_DIR') or _default_model_dir()}\n"
        f"Device: {os.environ.get('ACE_STEP_DEVICE') or get_settings().ace_step_device or 'mps'}"
    ) from last_err


def generate_wav_bytes(params: AceStepGenerateParams, *, progress_cb: Optional[ProgressCb] = None) -> bytes:
    """
    ACE-Step 1.5 local inference entrypoint (Mac default: MPS).

    This is intentionally a thin adapter so we can swap in the official ACE-Step
    pipeline once the library + weights are present locally.

    Official reference: https://github.com/ace-step/ACE-Step-1.5
    """

    model_dir = os.environ.get("ACE_STEP_MODEL_DIR") or _default_model_dir()
    device = (os.environ.get("ACE_STEP_DEVICE") or get_settings().ace_step_device or "mps").lower()

    # We keep this import inside the function so the rest of the app can run
    # even if torch/ace-step deps are not installed yet.
    try:
        import torch  # type: ignore
    except Exception as e:  # pragma: no cover
        raise AceStepNotInstalledError(
            "ACE-Step runtime requires PyTorch. Install torch for macOS (MPS) and add ACE-Step as a local dependency.\n"
            "Reference: https://github.com/ace-step/ACE-Step-1.5"
        ) from e

    if progress_cb:
        progress_cb(10, f"ace-step: init (device={device})")

    entry = _resolve_ace_step_entrypoint()

    # Best-effort argument mapping (only pass what the entrypoint accepts).
    sig = None
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


