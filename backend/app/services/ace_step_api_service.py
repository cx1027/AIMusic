from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable, Optional

import httpx
import replicate

from app.core.config import get_settings

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
    """Get Replicate API token from settings."""
    settings = get_settings()
    token = settings.replicate_api_token or ""
    if not token:
        raise AceStepApiError(
            "REPLICATE_API_TOKEN is required.\n"
            "Set REPLICATE_API_TOKEN in your .env file.\n"
            "Get your token from: https://replicate.com/account/api-tokens"
        )
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
) -> bytes:
    """
    Generate music using fishaudio/ace-step-1.5 via Replicate API.

    Workflow:
    1. Create Replicate prediction
    2. Poll until succeeded/failed
    3. Download audio from returned URI

    Args:
        params:         AceStepApiParams with generation settings.
        progress_cb:     Optional (progress_pct: int, message: str) callback.
        api_base_url:    Deprecated — kept for compatibility, ignored.

    Returns:
        Raw bytes of the generated audio (MP3/WAV/etc. per audio_format).
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
        replicate.api_token = api_token
        if progress_cb:
            progress_cb(10, "replicate: starting prediction")
        prediction = replicate.predictions.create(
            version=ACE_STEP_MODEL_VERSION,
            input=inp,
        )
        logger.info(f"[ace_step_api_service] Prediction created: {prediction.id}")
    except Exception as e:
        raise AceStepApiError(f"Failed to create Replicate prediction: {str(e)}") from e

    if progress_cb:
        progress_cb(15, f"replicate: queued (id: {prediction.id[:8]}...)")

    # Poll for completion
    max_attempts = 120
    poll_interval = 5

    for attempt in range(max_attempts):
        try:
            prediction.reload()
            status = prediction.status
            logger.debug(f"[ace_step_api_service] Poll {attempt + 1}: status={status}")
        except Exception as e:
            logger.warning(f"[ace_step_api_service] Poll {attempt + 1} failed: {str(e)}")
            time.sleep(poll_interval)
            continue

        if status == "succeeded":
            logger.info("[ace_step_api_service] Prediction succeeded")
            if progress_cb:
                progress_cb(80, "replicate: completed")
            break
        elif status == "failed":
            error_detail = ""
            try:
                error_detail = str(prediction.error) if prediction.error else "Unknown error"
            except Exception:
                pass
            logger.error(f"[ace_step_api_service] Prediction failed: {error_detail}")
            raise AceStepApiError(f"Replicate prediction failed: {error_detail}")
        elif status in ("starting", "queued"):
            if progress_cb:
                progress_cb(15 + min(60, attempt * 2), f"replicate: {status} (attempt {attempt + 1})")
            time.sleep(poll_interval)
        elif status == "processing":
            if progress_cb:
                progress_cb(25 + min(55, attempt * 3), f"replicate: processing (attempt {attempt + 1})")
            time.sleep(poll_interval)
        else:
            logger.warning(f"[ace_step_api_service] Unknown status: {status}")
            time.sleep(poll_interval)
    else:
        raise AceStepApiError(f"Prediction timed out after {max_attempts * poll_interval} seconds")

    # Parse output — official schema: array of URI strings
    try:
        output = prediction.output
        logger.info(f"[ace_step_api_service] Prediction output: {output}")

        if output is None:
            raise AceStepApiError("No output received from Replicate prediction")
        if isinstance(output, list) and len(output) == 0:
            raise AceStepApiError("Empty output array from Replicate prediction")

        # Output is an array of URIs
        if isinstance(output, list):
            audio_url = output[0]
        else:
            audio_url = output  # single URI string

        if not audio_url:
            raise AceStepApiError("Empty audio URL in prediction output")

        logger.info(f"[ace_step_api_service] Downloading audio from: {audio_url}")
    except AceStepApiError:
        raise
    except Exception as e:
        raise AceStepApiError(f"Failed to get prediction output: {str(e)}") from e

    # Download the audio file
    if progress_cb:
        progress_cb(85, "replicate: downloading audio")

    try:
        response = httpx.get(audio_url, timeout=120.0)
        response.raise_for_status()
        audio_bytes = response.content
    except httpx.HTTPError as e:
        raise AceStepApiError(f"Failed to download audio file: {str(e)}") from e

    logger.info(f"[ace_step_api_service] Audio downloaded, size: {len(audio_bytes)} bytes")

    if progress_cb:
        progress_cb(95, "replicate: audio downloaded")

    return audio_bytes
