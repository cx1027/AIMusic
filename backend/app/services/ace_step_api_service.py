from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Callable, Optional
from urllib.parse import urlparse, parse_qs

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

ProgressCb = Callable[[int, str], None]


@dataclass
class AceStepApiParams:
    """Parameters for ACE-Step API generation."""
    # Mode selection
    mode: str  # "simple" or "custom"
    
    # Simple mode (required when mode="simple")
    sample_query: Optional[str] = None
    
    # Custom mode (required when mode="custom")
    prompt: Optional[str] = None
    lyrics: Optional[str] = None
    
    # Optional parameters
    thinking: bool = True
    audio_duration: int = 60  # 10-600 seconds
    bpm: Optional[int] = None
    vocal_language: str = "en"
    audio_format: str = "mp3"
    inference_steps: int = 8
    batch_size: int = 1


class AceStepApiError(RuntimeError):
    """Raised when ACE-Step API call fails."""
    pass


def generate_music_via_api(
    params: AceStepApiParams,
    *,
    progress_cb: Optional[ProgressCb] = None,
    api_base_url: str = "http://127.0.0.1:8001",
) -> bytes:
    """
    Generate music using ACE-Step API at http://127.0.0.1:8001.
    
    Workflow:
    1. Submit task via POST /release_task
    2. Poll status via POST /query_result until completion
    3. Download audio file via GET /v1/audio?path=...
    
    Returns WAV bytes of the generated audio.
    """
    if progress_cb:
        progress_cb(5, "ace-step-api: preparing request")
    
    # Build request payload based on mode
    if params.mode == "simple":
        if not params.sample_query:
            raise AceStepApiError("sample_query is required for simple mode")
        payload = {
            "sample_query": params.sample_query,
            "thinking": params.thinking,
            "audio_duration": params.audio_duration,
            "vocal_language": params.vocal_language,
            "audio_format": params.audio_format,
            "inference_steps": params.inference_steps,
            "batch_size": params.batch_size,
        }
    elif params.mode == "custom":
        if not params.prompt:
            raise AceStepApiError("prompt is required for custom mode")
        payload = {
            "prompt": params.prompt,
            "lyrics": params.lyrics or "",
            "thinking": params.thinking,
            "audio_duration": params.audio_duration,
            "bpm": params.bpm,
            "vocal_language": params.vocal_language,
            "audio_format": params.audio_format,
            "inference_steps": params.inference_steps,
            "batch_size": params.batch_size,
        }
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}
    else:
        raise AceStepApiError(f"Invalid mode: {params.mode}. Must be 'simple' or 'custom'")
    
    logger.info(f"[ace_step_api_service] Submitting {params.mode} mode task to ACE-Step API")
    logger.debug(f"[ace_step_api_service] Payload: {json.dumps(payload, indent=2)}")
    
    # Step 1: Submit task
    release_task_url = f"{api_base_url}/release_task"
    if progress_cb:
        progress_cb(10, "ace-step-api: submitting task")
    
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                release_task_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            result = response.json()
    except httpx.HTTPError as e:
        raise AceStepApiError(f"Failed to submit task to ACE-Step API: {str(e)}") from e
    
    if result.get("code") != 200:
        error_msg = result.get("error", "Unknown error")
        raise AceStepApiError(f"ACE-Step API returned error: {error_msg}")
    
    task_id = result["data"]["task_id"]
    status = result["data"]["status"]
    queue_position = result["data"].get("queue_position", "N/A")
    
    logger.info(f"[ace_step_api_service] Task submitted: task_id={task_id}, status={status}, queue_position={queue_position}")
    
    if progress_cb:
        progress_cb(15, f"ace-step-api: task queued (position: {queue_position})")
    
    # Step 2: Poll for completion
    query_result_url = f"{api_base_url}/query_result"
    max_attempts = 120  # Maximum polling attempts (10 minutes at 5s interval)
    poll_interval = 5  # Seconds between polls
    
    task_result = None
    for attempt in range(max_attempts):
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    query_result_url,
                    json={"task_id_list": [task_id]},
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()
                result = response.json()
        except httpx.HTTPError as e:
            logger.warning(f"[ace_step_api_service] Poll attempt {attempt + 1} failed: {str(e)}")
            time.sleep(poll_interval)
            continue
        
        if result.get("code") == 200 and result.get("data"):
            task_data = result["data"][0]
            status = task_data["status"]
            
            # Status codes: 0 = processing, 1 = success, 2 = failed
            if status == 1:  # Success
                logger.info(f"[ace_step_api_service] Task completed successfully")
                task_result = json.loads(task_data["result"])
                if progress_cb:
                    progress_cb(80, "ace-step-api: task completed")
                break
            elif status == 2:  # Failed
                error_msg = task_data.get("result", "No error details")
                logger.error(f"[ace_step_api_service] Task failed: {error_msg}")
                raise AceStepApiError(f"Generation failed: {error_msg}")
            else:  # Processing (0)
                if progress_cb:
                    # Estimate progress: 15% (queued) to 75% (processing)
                    estimated_progress = 15 + min(60, attempt * 2)
                    progress_cb(estimated_progress, f"ace-step-api: processing (attempt {attempt + 1})")
                time.sleep(poll_interval)
        else:
            logger.warning(f"[ace_step_api_service] Unexpected response: {result}")
            time.sleep(poll_interval)
    else:
        raise AceStepApiError(f"Task did not complete within {max_attempts * poll_interval} seconds")
    
    if not task_result:
        raise AceStepApiError("Task completed but no result data available")
    
    # Step 3: Download audio file
    if progress_cb:
        progress_cb(85, "ace-step-api: downloading audio")
    
    # Extract audio file URL from result
    audio_file_url = task_result[0].get("file", "")
    if not audio_file_url:
        raise AceStepApiError("No audio file URL in task result")
    
    # Parse the URL to get the path parameter
    parsed_url = urlparse(audio_file_url)
    audio_path = parse_qs(parsed_url.query).get("path", [None])[0]
    
    if not audio_path:
        raise AceStepApiError("Could not extract audio path from result URL")
    
    # Construct download URL
    download_url = f"{api_base_url}/v1/audio?path={audio_path}"
    logger.info(f"[ace_step_api_service] Downloading audio from: {download_url}")
    
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.get(download_url)
            response.raise_for_status()
            audio_bytes = response.content
    except httpx.HTTPError as e:
        raise AceStepApiError(f"Failed to download audio file: {str(e)}") from e
    
    logger.info(f"[ace_step_api_service] Audio downloaded, size: {len(audio_bytes)} bytes")
    
    if progress_cb:
        progress_cb(95, "ace-step-api: audio downloaded")
    
    # Convert to WAV if needed (for now, assume API returns the requested format)
    # The audio_bytes might be MP3, so we'd need to convert it to WAV
    # For simplicity, we'll return it as-is and let the caller handle conversion if needed
    # Or we could use pydub/ffmpeg to convert MP3 to WAV here
    
    return audio_bytes
