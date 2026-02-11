from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sse_starlette.sse import EventSourceResponse
from sqlmodel import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.progress_service import get_task, init_task
from app.tasks.music_generation import run_generation_task

router = APIRouter()


class GenerateRequestPayload(Dict[str, Any]):
    """
    Lightweight payload container (kept intentionally flexible for MVP).
    Expected keys:
      - prompt: str
      - lyrics: Optional[str]
      - duration: int
    """


@router.post("", status_code=status.HTTP_201_CREATED)
def create_generation(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="prompt is required")

    duration = payload.get("duration", 30)
    try:
        duration_int = int(duration)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="duration must be an integer")
    if duration_int <= 0 or duration_int > 300:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="duration out of range (1-300)")

    lyrics = payload.get("lyrics")
    if lyrics is not None:
        lyrics = str(lyrics)

    # Simple credits gate for MVP
    if user.credits_balance <= 0:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient credits")
    user.credits_balance -= 1
    db.add(user)
    db.commit()

    task_id = str(uuid4())
    init_task(
        task_id,
        user_id=str(user.id),
        payload={"prompt": prompt, "lyrics": lyrics, "duration": duration_int},
    )

    run_generation_task.delay(task_id=task_id, user_id=str(user.id), prompt=prompt, lyrics=lyrics, duration=duration_int)

    return {"task_id": task_id, "events_url": f"/api/generate/events/{task_id}"}


@router.get("/events/{task_id}")
async def generation_events(
    task_id: str,
    request: Request,
    user: User = Depends(get_current_user),
) -> EventSourceResponse:
    async def event_gen() -> AsyncGenerator[dict, None]:
        last_payload: Optional[str] = None
        while True:
            if await request.is_disconnected():
                break

            state = get_task(task_id)
            if state is None:
                yield {"event": "error", "data": json.dumps({"detail": "task not found"})}
                break

            # Basic ownership check
            if str(state.get("user_id")) != str(user.id):
                yield {"event": "error", "data": json.dumps({"detail": "not found"})}
                break

            data = json.dumps(state, ensure_ascii=False)
            if data != last_payload:
                yield {"event": "progress", "data": data}
                last_payload = data

            if state.get("status") in ("completed", "failed"):
                break

            await asyncio.sleep(1.0)

    return EventSourceResponse(event_gen())


