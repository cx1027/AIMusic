from __future__ import annotations

import json
from typing import Any, Dict, Optional

from app.core.cache import get_redis


def _key(task_id: str) -> str:
    return f"gen:{task_id}"

def _channel(task_id: str) -> str:
    return f"gen-events:{task_id}"


def init_task(task_id: str, *, user_id: str, payload: Dict[str, Any], ttl_seconds: int = 60 * 60) -> None:
    r = get_redis()
    state = {
        "task_id": task_id,
        "user_id": user_id,
        "status": "queued",  # queued | running | completed | failed
        "progress": 0,
        "message": "queued",
        "payload": payload,
        "result": None,
    }
    r.set(_key(task_id), json.dumps(state), ex=ttl_seconds)
    # Emit initial event so SSE subscribers get an immediate payload.
    r.publish(_channel(task_id), json.dumps(state, ensure_ascii=False))


def update_task(
    task_id: str,
    *,
    status: Optional[str] = None,
    progress: Optional[int] = None,
    message: Optional[str] = None,
    result: Optional[Dict[str, Any]] = None,
    ttl_seconds: int = 60 * 60,
) -> None:
    r = get_redis()
    raw = r.get(_key(task_id))
    if raw:
        state = json.loads(raw)
    else:
        state = {"task_id": task_id}
    if status is not None:
        state["status"] = status
    if progress is not None:
        state["progress"] = int(progress)
    if message is not None:
        state["message"] = message
    if result is not None:
        state["result"] = result
    r.set(_key(task_id), json.dumps(state), ex=ttl_seconds)
    r.publish(_channel(task_id), json.dumps(state, ensure_ascii=False))


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    r = get_redis()
    raw = r.get(_key(task_id))
    if not raw:
        return None
    return json.loads(raw)


