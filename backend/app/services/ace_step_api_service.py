from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import replicate
from dotenv import dotenv_values

from app.services.storage_service import AudioStorageResult, get_storage

logger = logging.getLogger(__name__)

ProgressCb = Callable[[int, str], None]

# fishaudio/ace-step-1.5 latest version on Replicate
ACE_STEP_MODEL_VERSION = "74e3a7d383b18815e277de5223f5fe9d53d38832de15aa567fe729fa129d0d85"


@dataclass
class AceStepApiParams:
    """Parameters for ACE-Step generation via Replicate."""
    # Mode selection
    mode: str  # "simple" or "custom"

    # Simple mode (required when mode="simple")
    sample_query: Optional[str] = None

    # Custom mode (required when mode="custom")
    prompt: Optional[str] = None
    lyrics: Optional[str] = None

    # Optional parameters — mirrors official Replicate API
    thinking: bool = True
    audio_duration: int = 60   # maps to "duration" (1-600, -1 for auto)
    shift: float = 3.0         # timestep shift (turbo: 3.0)
    guidance_scale: float = 7.0
    inference_steps: int = 8
    seed: int = -1
    bpm: Optional[int] = None
    key_scale: str = ""
    time_signature: str = "auto"
    audio_format: str = "mp3"
    batch_size: int = 1


class AceStepApiError(RuntimeError):
    """Raised when ACE-Step API call fails."""
    pass


def _get_replicate_token() -> str:
    """Get Replicate API token directly from backend/.env file and set it as env var."""
    env_path = Path(__file__).parent.parent.parent / ".env"
    env_vars = dotenv_values(env_path)
    token = env_vars.get("REPLICATE_API_TOKEN", "")
    if not token:
        raise AceStepApiError(
            "REPLICATE_API_TOKEN is required.\n"
            "Set REPLICATE_API_TOKEN in your backend/.env file.\n"
            "Get your token from: https://replicate.com/account/api-tokens"
        )
    # replicate.run() reads REPLICATE_API_TOKEN from env, not from replicate.api_token
    os.environ["REPLICATE_API_TOKEN"] = token
    return token


def _build_replicate_input(params: AceStepApiParams) -> dict:
    """
    Build the input dict for Replicate fishaudio/ace-step-1.5 API.

    Official parameters (from https://replicate.com/fishaudio/ace-step-1.5):
      - prompt          string  Music description text (max 512 chars)
      - lyrics           string  Lyrics / structured sections (max 4096 chars)
      - duration        int     1-600 seconds, -1 for auto  (default 30)
      - bpm             int     30-300, omit for auto
      - key_scale       string  e.g. "C major", empty for auto
      - time_signature   string  "2"|"3"|"4"|"6"|"auto" (default "auto")
      - inference_steps int     1-200, turbo: 4-8, base/SFT: 32-100 (default 8)
      - guidance_scale  float   1-15, ignored by turbo (default 7)
      - shift           float   1-5, use 3.0 for turbo (default 3)
      - seed            int     -1 for random (default -1)
      - thinking        bool    Enable LLM chain-of-thought (default True)
      - batch_size      int     1-4 (default 1)
      - audio_format    string  Output format (default "mp3")
    """
    inp: dict[str, object] = {
        "prompt": params.prompt or "",
        "lyrics": params.lyrics or "",
        "duration": params.audio_duration,
        "inference_steps": params.inference_steps,
        "guidance_scale": params.guidance_scale,
        "shift": params.shift,
        "seed": params.seed if params.seed >= 0 else -1,
        "thinking": params.thinking,
        "batch_size": params.batch_size,
        "audio_format": params.audio_format,
    }

    # Optional fields — only include when set
    if params.bpm is not None:
        inp["bpm"] = params.bpm
    if params.key_scale:
        inp["key_scale"] = params.key_scale
    if params.time_signature and params.time_signature != "auto":
        inp["time_signature"] = params.time_signature

    return inp


def generate_music_via_api(
    params: AceStepApiParams,
    *,
    progress_cb: Optional[ProgressCb] = None,
    api_base_url: Optional[str] = None,
) -> tuple[bytes, str]:
    """
    Generate music using fishaudio/ace-step-1.5 via Replicate API,
    then upload the result directly to R2 (or local storage).

    Uses replicate.run() which blocks until the prediction completes,
    polling internally — no manual polling loop needed.

    Args:
        params:         AceStepApiParams with generation settings.
        progress_cb:    Optional (progress_pct: int, message: str) callback.
        api_base_url:   Deprecated — kept for compatibility, ignored.

    Returns:
        (audio_bytes, r2_url) where:
          - audio_bytes: raw bytes of the generated audio (MP3/WAV/etc.)
          - r2_url:      public R2/storage URL for direct playback
    """
    if api_base_url is not None:
        logger.warning("[ace_step_api_service] api_base_url is deprecated; using Replicate")

    # Validate mode
    if params.mode == "simple":
        if not params.sample_query:
            raise AceStepApiError("sample_query is required for simple mode")
        tags = params.sample_query
        lyrics_str = "[Instrumental]"  # simple = instrumental
    elif params.mode == "custom":
        if not params.prompt:
            raise AceStepApiError("prompt is required for custom mode")
        tags = params.prompt
        lyrics_str = params.lyrics or ""
    else:
        raise AceStepApiError(f"Invalid mode: {params.mode}. Must be 'simple' or 'custom'")

    inp = _build_replicate_input(params)
    inp["prompt"] = tags
    inp["lyrics"] = lyrics_str

    logger.info(f"[ace_step_api_service] Submitting {params.mode} mode to Replicate ace-step-1.5")
    logger.debug(f"[ace_step_api_service] Input: {inp}")

    if progress_cb:
        progress_cb(5, "replicate: preparing request")

    api_token = _get_replicate_token()

    try:
        print(f"[INFO] replicate.run called with inp={inp}") 
        if progress_cb:
            progress_cb(10, "replicate: running prediction")

        output = replicate.run(
            f"fishaudio/ace-step-1.5:{ACE_STEP_MODEL_VERSION}",
            input=inp,
        )
        print("!!!!!!!!!!!!output")
        print(output[0].url)
        logger.info(f"[ace_step_api_service] Prediction output: {output}")
    except Exception as e:
        raise AceStepApiError(f"Replicate prediction failed: {str(e)}") from e

    # Parse output — replicate.run returns a list of file objects
    try:
        if not isinstance(output, list) or len(output) == 0:
            raise AceStepApiError("Unexpected output from Replicate: expected non-empty list")

        audio_file = output[0]
        audio_bytes = audio_file.read()
        replicate_url = audio_file.url
        logger.info(f"[ace_step_api_service] Audio read, size: {len(audio_bytes)} bytes")
        logger.info(f"[ace_step_api_service] Replicate URL: {replicate_url}")
    except AceStepApiError:
        raise
    except Exception as e:
        raise AceStepApiError(f"Failed to read prediction output: {str(e)}") from e

    # Upload directly to R2 with date-based folder path
    suffix = f".{params.audio_format}"
    content_type = f"audio/{params.audio_format}" if params.audio_format in ["mp3", "wav", "flac"] else "audio/mpeg"
    storage_result: AudioStorageResult = get_storage().upload_to_r2(
        content=audio_bytes,
        suffix=suffix,
        content_type=content_type,
    )
    logger.info(f"[ace_step_api_service] R2 upload complete: {storage_result.r2_url}")

    if progress_cb:
        progress_cb(100, "replicate: completed")

    return audio_bytes, storage_result.r2_url
