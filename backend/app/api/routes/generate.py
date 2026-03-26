from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any, AsyncGenerator, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Request, status
from sse_starlette.sse import EventSourceResponse
from sqlmodel import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.progress_service import get_task, init_task
from app.tasks.music_generation import run_generation_task

router = APIRouter()


class GenerateRequestPayload(Dict[str, Any]):
    """
    Payload for music generation.
    Expected keys:
      - mode: str ("simple" or "custom") - required
      - For simple mode: sample_query (required)
      - For custom mode: prompt (required), lyrics (optional)
      - Optional: thinking, audio_duration (-1 or 10-600), bpm, vocal_language, audio_format, inference_steps, batch_size
      - title: Optional[str]
      - genre: Optional[str]
    """


@router.post("", status_code=status.HTTP_201_CREATED)
def create_generation(
    background_tasks: BackgroundTasks,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    title = payload.get("title")
    if title is not None:
        title = str(title).strip()
        if not title:
            title = None

    # Mode selection: "simple" or "custom" - required
    mode_raw = payload.get("mode")
    if mode_raw is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mode is required (must be 'simple' or 'custom')")
    if not isinstance(mode_raw, str):
        mode_raw = str(mode_raw)
    mode = mode_raw.strip().lower()
    if not mode or mode not in ("simple", "custom"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mode must be 'simple' or 'custom'")

    # Validate mode-specific required fields
    if mode == "simple":
        sample_query = (payload.get("sample_query") or "").strip()
        if not sample_query:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sample_query is required for simple mode")
        prompt = None
        caption = None
        lyrics = None
    else:  # custom mode
        caption = (payload.get("caption") or "").strip()
        if not caption:
            # Back-compat for older clients
            caption = (payload.get("prompt") or "").strip()
        if not caption:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="caption is required for custom mode")
        lyrics_raw = payload.get("lyrics")
        lyrics = str(lyrics_raw).strip() if lyrics_raw is not None else ""
        if not lyrics:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lyrics is required for custom mode")
        prompt = caption  # internal name used by Celery task + API adapter
        sample_query = None

    # Optional parameters with defaults
    thinking = payload.get("thinking", True)
    if not isinstance(thinking, bool):
        thinking = True
    
    instrumental = bool(payload.get("instrumental", False))

    audio_duration = payload.get("audio_duration")
    if audio_duration is None:
        audio_duration_int = -1
    else:
        try:
            audio_duration_int = int(audio_duration)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="audio_duration must be an integer")
        if audio_duration_int != -1 and (audio_duration_int < 10 or audio_duration_int > 600):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="audio_duration out of range (10-600, or -1 for auto)")

    bpm = payload.get("bpm")
    if bpm is not None:
        try:
            bpm_int = int(bpm)
            if bpm_int <= 0:
                bpm_int = None
        except Exception:
            bpm_int = None
    else:
        bpm_int = None

    vocal_language = payload.get("vocal_language", "en")
    if not isinstance(vocal_language, str):
        vocal_language = "en"

    audio_format = payload.get("audio_format", "mp3")
    if not isinstance(audio_format, str):
        audio_format = "mp3"

    inference_steps = payload.get("inference_steps", 8)
    try:
        inference_steps_int = int(inference_steps)
        if inference_steps_int < 1:
            inference_steps_int = 8
    except Exception:
        inference_steps_int = 8

    batch_size = payload.get("batch_size", 1)
    try:
        batch_size_int = int(batch_size)
        if batch_size_int < 1:
            batch_size_int = 1
    except Exception:
        batch_size_int = 1

    genre = payload.get("genre")
    if genre is not None:
        # Handle multiple genres: can be a list, comma-separated string, or single string
        if isinstance(genre, list):
            # If it's a list, join with comma
            genre = ", ".join(str(g).strip() for g in genre if str(g).strip())
            genre = genre if genre else None
        else:
            # If it's a string, check if it contains commas (multiple genres)
            genre_str = str(genre).strip()
            if genre_str:
                # If it's already comma-separated, keep it; otherwise it's a single genre
                genre = genre_str
            else:
                genre = None

    # Simple credits gate for MVP - each song costs 2 credits
    if user.credits_balance < 2:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient credits. Each song costs 2 credits.")
    user.credits_balance -= 2
    db.add(user)
    db.commit()
    db.refresh(user)  # Ensure user object is refreshed with updated credits

    task_id = str(uuid4())
    init_task(
        task_id,
        user_id=str(user.id),
        payload={
            "title": title,
            "mode": mode,
            "caption": caption,
            "prompt": prompt,
            "sample_query": sample_query,
            "lyrics": lyrics,
            "audio_duration": audio_duration_int,
            "thinking": thinking,
            "instrumental": instrumental,
            "bpm": bpm_int,
            "vocal_language": vocal_language,
            "audio_format": audio_format,
            "inference_steps": inference_steps_int,
            "batch_size": batch_size_int,
            "genre": genre,
        },
    )

    # Check if FLUXSCHNELL=RUNPOD, if so, use BackgroundTasks instead of Celery
    flux_schnell = os.getenv("FLUXSCHNELL", "").strip().upper()
    print(f"[generate] FLUXSCHNELL env var: '{flux_schnell}'", flush=True)
    if flux_schnell == "RUNPOD":
        # Use BackgroundTasks instead of Celery task
        print(f"[generate] Using BackgroundTasks (RUNPOD mode) for task_id={task_id}", flush=True)
        background_tasks.add_task(
            run_generation_task,
            task_id=task_id,
            user_id=str(user.id),
            title=title,
            mode=mode,
            caption=caption,
            prompt=prompt,
            sample_query=sample_query,
            lyrics=lyrics,
            audio_duration=audio_duration_int,
            thinking=thinking,
            bpm=bpm_int,
            vocal_language=vocal_language,
            audio_format=audio_format,
            inference_steps=inference_steps_int,
            batch_size=batch_size_int,
            genre=genre,
            instrumental=instrumental,
        )
        print(f"[generate] Background task added successfully", flush=True)
    else:
        # Use Celery task as before
        print(f"[generate] Using Celery task for task_id={task_id}", flush=True)
        run_generation_task.delay(
            task_id=task_id,
            user_id=str(user.id),
            title=title,
            mode=mode,
            caption=caption,
            prompt=prompt,
            sample_query=sample_query,
            lyrics=lyrics,
            audio_duration=audio_duration_int,
            thinking=thinking,
            bpm=bpm_int,
            vocal_language=vocal_language,
            audio_format=audio_format,
            inference_steps=inference_steps_int,
            batch_size=batch_size_int,
            genre=genre,
            instrumental=instrumental,
        )

    return {"task_id": task_id, "events_url": f"/api/generate/events/{task_id}"}


@router.get("/events/{task_id}")
async def generation_events(
    task_id: str,
    request: Request,
    user: User = Depends(get_current_user),
) -> EventSourceResponse:
    async def event_gen() -> AsyncGenerator[dict, None]:
        last_payload: Optional[str] = None
        max_wait_seconds = 300  # 5 minutes timeout
        start_time = time.time()
        
        try:
            while True:
                if await request.is_disconnected():
                    break

                # Timeout check
                elapsed = time.time() - start_time
                if elapsed > max_wait_seconds:
                    yield {"event": "error", "data": json.dumps({"detail": "timeout waiting for task completion"})}
                    break

                try:
                    state = get_task(task_id)
                except Exception as e:
                    yield {"event": "error", "data": json.dumps({"detail": f"failed to get task: {str(e)}"})}
                    break

                if state is None:
                    yield {"event": "error", "data": json.dumps({"detail": "task not found"})}
                    break

                # Basic ownership check
                if str(state.get("user_id")) != str(user.id):
                    yield {"event": "error", "data": json.dumps({"detail": "not found"})}
                    break

                data = json.dumps(state, ensure_ascii=False)
                # Always yield on first iteration, then only when state changes
                if last_payload is None or data != last_payload:
                    yield {"event": "progress", "data": data}
                    last_payload = data

                if state.get("status") in ("completed", "failed"):
                    break

                await asyncio.sleep(1.0)
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"detail": f"unexpected error: {str(e)}"})}

    return EventSourceResponse(event_gen())


