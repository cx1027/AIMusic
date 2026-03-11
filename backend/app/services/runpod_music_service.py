from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class RunPodError(RuntimeError):
    pass


@dataclass
class RunPodSubmitResult:
    runpod_job_id: str
    raw: Dict[str, Any]


@dataclass
class RunPodStatusResult:
    status: str  # IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED | CANCELLED | TIMED_OUT | UNKNOWN
    output_url: Optional[str]
    raw: Dict[str, Any]


def _auth_headers() -> dict:
    s = get_settings()
    if not s.runpod_api_key:
        raise RunPodError("Missing RUNPOD_API_KEY (runpod_api_key)")
    return {"Authorization": f"Bearer {s.runpod_api_key}"}


def _endpoint_id() -> str:
    s = get_settings()
    if not s.runpod_endpoint_id:
        raise RunPodError("Missing RUNPOD_ENDPOINT_ID (runpod_endpoint_id)")
    return s.runpod_endpoint_id


def submit_runpod_job(*, input_payload: Dict[str, Any]) -> RunPodSubmitResult:
    """
    Submit a Serverless job:
      POST https://api.runpod.ai/v2/{endpoint_id}/run
    """
    s = get_settings()
    url = f"{(s.runpod_api_base_url or 'https://api.runpod.ai/v2').rstrip('/')}/{_endpoint_id()}/run"
    body = {"input": input_payload}

    logger.info("[runpod] submit job -> %s", url)
    # Helpful for debugging RunPod-side input validation/runtime issues.
    # Truncate large prompt/lyrics fields to keep logs readable.
    try:
        safe_input = dict(input_payload)
        for k in ("prompt", "caption", "sample_query", "lyrics"):
            if k in safe_input and safe_input[k] is not None:
                s_val = str(safe_input[k])
                if len(s_val) > 240:
                    safe_input[k] = s_val[:240] + "...(truncated)"
        logger.info("[runpod] submit body.input = %s", safe_input)
    except Exception:
        logger.info("[runpod] submit body.input = <unloggable payload>")
    try:
        with httpx.Client(timeout=float(s.runpod_request_timeout_seconds or 30)) as client:
            resp = client.post(url, json=body, headers={"Content-Type": "application/json", **_auth_headers()})
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise RunPodError(f"RunPod submit failed: {e}") from e
    except Exception as e:
        raise RunPodError(f"RunPod submit failed: {type(e).__name__}: {e}") from e

    # RunPod typically returns: {"id": "...", "status": "...", ...}
    job_id = data.get("id") or data.get("jobId") or data.get("job_id")
    if not job_id:
        raise RunPodError(f"RunPod submit returned no job id: {data}")

    return RunPodSubmitResult(runpod_job_id=str(job_id), raw=data)


def get_runpod_status(*, runpod_job_id: str) -> RunPodStatusResult:
    """
    Poll job status:
      GET https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}
    """
    s = get_settings()
    url = f"{(s.runpod_api_base_url or 'https://api.runpod.ai/v2').rstrip('/')}/{_endpoint_id()}/status/{runpod_job_id}"

    logger.debug("[runpod] status -> %s", url)
    try:
        with httpx.Client(timeout=float(s.runpod_request_timeout_seconds or 30)) as client:
            resp = client.get(url, headers=_auth_headers())
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise RunPodError(f"RunPod status failed: {e}") from e
    except Exception as e:
        raise RunPodError(f"RunPod status failed: {type(e).__name__}: {e}") from e

    raw_status = str(data.get("status") or "UNKNOWN").upper()

    # Output URL is application-specific; we support a few common shapes:
    # - data["output"]["output_url"]
    # - data["output"]["url"]
    # - data["output_url"]
    output = data.get("output") if isinstance(data.get("output"), dict) else {}
    output_url = None
    if isinstance(output, dict):
        output_url = output.get("output_url") or output.get("url")
    if not output_url:
        output_url = data.get("output_url")

    return RunPodStatusResult(status=raw_status, output_url=output_url, raw=data)

