from __future__ import annotations

import os
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user, get_db
from app.core.config import get_settings
from app.core.database import engine
from app.models.song import Song
from app.models.user import User
from app.services.image_gen_service import FluxNotInstalledError, generate_cover_image
from app.services.progress_service import get_task, init_task, update_task
from app.services.runpod_music_service import RunPodError, get_runpod_status, submit_runpod_job
from app.services.storage_service import get_storage

router = APIRouter()


def _require_runpod_enabled() -> None:
    s = get_settings()
    if (s.music_generation_backend or "celery").lower() != "runpod":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="RunPod music generation is disabled. Set MUSIC_GENERATION_BACKEND=runpod",
        )


@router.post("/generate", status_code=status.HTTP_201_CREATED)
def music_generate(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    _require_runpod_enabled()

    # Validate: keep parity with /api/generate schema (simple/custom)
    mode_raw = payload.get("mode")
    if mode_raw is None:
        raise HTTPException(status_code=400, detail="mode is required (must be 'simple' or 'custom')")
    mode = str(mode_raw).strip().lower()
    if mode not in ("simple", "custom"):
        raise HTTPException(status_code=400, detail="mode must be 'simple' or 'custom'")

    if mode == "simple":
        sample_query = (payload.get("sample_query") or "").strip()
        if not sample_query:
            raise HTTPException(status_code=400, detail="sample_query is required for simple mode")
        prompt = None
        lyrics = None
    else:
        prompt = (payload.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="prompt is required for custom mode")
        lyrics = payload.get("lyrics")
        if lyrics is not None:
            lyrics = str(lyrics).strip() if lyrics else None
        sample_query = None

    # Optional fields (pass-through to RunPod input)
    title = payload.get("title")
    genre = payload.get("genre")
    thinking = bool(payload.get("thinking", True))
    # Support both `audio_duration` (frontend) and `duration` (common RunPod examples)
    audio_duration = payload.get("audio_duration", payload.get("duration", 60))
    try:
        audio_duration_int = int(audio_duration)
    except Exception:
        raise HTTPException(status_code=400, detail="audio_duration must be an integer")
    if audio_duration_int < 10 or audio_duration_int > 600:
        raise HTTPException(status_code=400, detail="audio_duration out of range (10-600)")

    bpm = payload.get("bpm")
    bpm_int: Optional[int]
    if bpm is not None:
        try:
            bpm_int = int(bpm)
            if bpm_int <= 0:
                bpm_int = None
        except Exception:
            bpm_int = None
    else:
        bpm_int = None

    vocal_language = str(payload.get("vocal_language", "en") or "en")
    audio_format = str(payload.get("audio_format", "mp3") or "mp3")
    inference_steps = payload.get("inference_steps", 8)
    batch_size = payload.get("batch_size", 1)
    try:
        inference_steps_int = max(1, int(inference_steps))
    except Exception:
        inference_steps_int = 8
    try:
        batch_size_int = max(1, int(batch_size))
    except Exception:
        batch_size_int = 1

    # Credits gate: keep consistent with existing generate.py (2 credits)
    if user.credits_balance < 2:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient credits. Each song costs 2 credits.")
    user.credits_balance -= 2
    db.add(user)
    db.commit()
    db.refresh(user)

    job_id = str(uuid4())
    init_task(
        job_id,
        user_id=str(user.id),
        payload={
            "title": title,
            "genre": genre,
            "mode": mode,
            "prompt": prompt,
            "sample_query": sample_query,
            "lyrics": lyrics,
            "thinking": thinking,
            "audio_duration": audio_duration_int,
            "bpm": bpm_int,
            "vocal_language": vocal_language,
            "audio_format": audio_format,
            "inference_steps": inference_steps_int,
            "batch_size": batch_size_int,
        },
    )

    # Submit到 RunPod Serverless。
    # 你的 RunPod endpoint 只需要：
    #   { "input": { "prompt": "...", "duration": 10 } }
    # 并且会在远端生成 MP3 并上传到 R2。
    update_task(job_id, status="running", progress=5, message="runpod: submitting")
    try:
        # simple 模式用 sample_query，当作最终 prompt；
        # custom 模式用 prompt。
        runpod_prompt = sample_query if mode == "simple" else prompt
        runpod_input = {
            "prompt": runpod_prompt,
            "duration": audio_duration_int,
        }
        submit_res = submit_runpod_job(input_payload=runpod_input)
    except RunPodError as e:
        update_task(job_id, status="failed", progress=100, message=str(e), result=None)
        raise HTTPException(status_code=502, detail=str(e))

    update_task(
        job_id,
        status="running",
        progress=10,
        message="runpod: queued",
        result={"runpod_job_id": submit_res.runpod_job_id, "output_url": None},
    )
    return {"job_id": job_id, "runpod_job_id": submit_res.runpod_job_id}


def _finalize_runpod_job(
    *,
    job_id: str,
    user_id: str,
    audio_url: str,
    payload: Dict[str, Any],
) -> None:
    """
    Finalize a completed RunPod job by:
    1. Generating cover image
    2. Creating Song record in database
    3. Updating task result with song_id and cover_image_url
    """
    import traceback
    
    print(f"\n{'='*80}", flush=True)
    print(f"[music_status] FINALIZING JOB: job_id={job_id}", flush=True)
    print(f"[music_status] Audio URL: {audio_url}", flush=True)
    print(f"{'='*80}\n", flush=True)
    
    try:
        # Extract payload fields
        title = payload.get("title")
        mode = payload.get("mode", "custom")
        prompt = payload.get("prompt")
        sample_query = payload.get("sample_query")
        lyrics = payload.get("lyrics")
        audio_duration = payload.get("audio_duration", 60)
        genre = payload.get("genre")
        bpm = payload.get("bpm")
        
        # Use appropriate prompt for cover image
        cover_prompt = prompt if mode == "custom" else (sample_query or "Generated music")
        song_prompt = prompt if mode == "custom" else (sample_query or "Generated")
        
        print(f"[music_status] Cover prompt: '{cover_prompt[:100] if cover_prompt else 'N/A'}...'", flush=True)
        print(f"[music_status] Title: '{title}'", flush=True)
        
        # Generate cover image
        cover_image_url = None
        cover_image_error = None
        try:
            print(f"[music_status] ========== STARTING COVER IMAGE GENERATION ==========", flush=True)
            print(f"[music_status] Calling generate_cover_image...", flush=True)
            cover_res = generate_cover_image(prompt=cover_prompt, title=title)
            print(f"[music_status] Cover image generated successfully, size: {len(cover_res.image_bytes)} bytes", flush=True)
            cover_stored = get_storage().store_bytes(content=cover_res.image_bytes, suffix=".png", content_type="image/png")
            cover_image_url = cover_stored.url
            print(f"[music_status] Cover image uploaded: {cover_image_url}", flush=True)
        except FluxNotInstalledError as e:
            error_msg = str(e).strip() if str(e) else "FLUX.1 Schnell is not available or not properly configured"
            print(f"[music_status] FLUX.1 Schnell not available, skipping cover image: {error_msg}", flush=True)
            print(f"[music_status] Traceback: {traceback.format_exc()}", flush=True)
            cover_image_error = error_msg
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}" if str(e) else f"{type(e).__name__}: Unknown error occurred"
            print(f"[music_status] Error generating cover image: {error_msg}", flush=True)
            print(f"[music_status] Traceback: {traceback.format_exc()}", flush=True)
            cover_image_error = error_msg
        
        # Create Song record
        print(f"[music_status] Creating Song record...", flush=True)
        song_id = None
        with Session(engine) as db:
            song = Song(
                user_id=UUID(user_id),
                title=title or "Generated",
                prompt=song_prompt,
                lyrics=lyrics,
                duration=audio_duration,
                bpm=bpm,
                audio_url=audio_url,
                cover_image_url=cover_image_url,
                genre=genre,
            )
            db.add(song)
            db.commit()
            db.refresh(song)
            song_id = str(song.id)
            print(f"[music_status] Song created: song_id={song_id}", flush=True)
        
        # Update task result with song_id and cover_image_url
        if not song_id:
            raise ValueError("Failed to create Song record: song_id is None")
        
        result = {
            "song_id": song_id,
            "audio_url": audio_url,
            "cover_image_url": cover_image_url,
        }
        if cover_image_error:
            result["cover_image_error"] = cover_image_error
            print(f"[music_status] Adding cover_image_error to result: {cover_image_error[:100]}...", flush=True)
        
        print(f"[music_status] Final result before update_task: cover_image_url={cover_image_url}, result keys={list(result.keys())}", flush=True)
        update_task(job_id, status="completed", progress=100, message="completed", result=result)
        print(f"[music_status] Task finalized successfully", flush=True)
        
        # Verify the result was saved correctly
        try:
            verify_state = get_task(job_id)
            verify_result = verify_state.get("result") if verify_state else None
            print(f"[music_status] Verification - saved cover_image_url: {verify_result.get('cover_image_url') if isinstance(verify_result, dict) else 'N/A'}", flush=True)
        except Exception as e:
            print(f"[music_status] Error verifying saved state: {e}", flush=True)
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"[music_status] ========== ERROR FINALIZING JOB ==========", flush=True)
        print(f"[music_status] Error type: {type(e).__name__}", flush=True)
        print(f"[music_status] Error message: {str(e)}", flush=True)
        print(f"[music_status] Full traceback:\n{error_traceback}", flush=True)
        print(f"[music_status] ========================================", flush=True)
        # Update task with error but don't fail the whole job
        # Try to preserve existing result data if available
        try:
            current_state = get_task(job_id)
            existing_result = current_state.get("result") or {} if current_state else {}
            if isinstance(existing_result, dict):
                current_result = existing_result.copy()
            else:
                current_result = {}
        except Exception:
            current_result = {}
        
        current_result["output_url"] = audio_url
        current_result["finalization_error"] = str(e)
        update_task(job_id, status="completed", progress=100, message="completed (with errors)", result=current_result)


@router.get("/status/{job_id}")
def music_status(
    job_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
) -> dict:
    _require_runpod_enabled()

    state = get_task(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="job not found")
    if str(state.get("user_id")) != str(user.id):
        raise HTTPException(status_code=404, detail="job not found")

    # Check if already completed and finalized FIRST (before trying to extract runpod_job_id)
    # After finalization, the result structure changes and runpod_job_id may no longer be present
    current_status = state.get("status")
    current_result = state.get("result") or {}
    if current_status == "completed" and isinstance(current_result, dict) and current_result.get("song_id"):
        # Already finalized, return current state (refresh to ensure consistency)
        try:
            refreshed = get_task(job_id)
            if refreshed:
                refreshed_result = refreshed.get("result") or {}
                print(f"[music_status] Returning finalized state - cover_image_url: {refreshed_result.get('cover_image_url') if isinstance(refreshed_result, dict) else 'N/A'}", flush=True)
                return refreshed
        except Exception as e:
            print(f"[music_status] Error refreshing task state: {e}", flush=True)
        print(f"[music_status] Returning finalized state (fallback) - cover_image_url: {current_result.get('cover_image_url') if isinstance(current_result, dict) else 'N/A'}", flush=True)
        return state

    # Extract runpod job id (only needed if not finalized)
    runpod_job_id = None
    if isinstance(state.get("result"), dict):
        runpod_job_id = state["result"].get("runpod_job_id")
    if not runpod_job_id and isinstance(state.get("payload"), dict):
        runpod_job_id = state["payload"].get("runpod_job_id")

    if not runpod_job_id:
        update_task(job_id, status="failed", progress=100, message="missing runpod_job_id", result=None)
        raise HTTPException(status_code=500, detail="job state corrupted (missing runpod_job_id)")

    try:
        st = get_runpod_status(runpod_job_id=str(runpod_job_id))
    except RunPodError as e:
        # Don't flip to failed on transient status fetch errors; just surface it.
        raise HTTPException(status_code=502, detail=str(e))
    
    # Map RunPod status -> our status/progress
    rp_status = (st.status or "UNKNOWN").upper()
    if rp_status in ("COMPLETED", "SUCCEEDED", "SUCCESS"):
        if not st.output_url:
            update_task(job_id, status="failed", progress=100, message="runpod: completed but missing output_url", result={"runpod_job_id": runpod_job_id, "output_url": None})
        else:
            # Check if we're already finalizing (status is "running" with message "finalizing")
            if current_status == "running" and state.get("message") == "finalizing":
                # Already finalizing, just return current state
                return state
            
            # Check if we've already finalized (has song_id)
            if isinstance(current_result, dict) and current_result.get("song_id"):
                # Already finalized, mark as completed and return updated state
                update_task(job_id, status="completed", progress=100, message="completed", result=current_result)
                refreshed = get_task(job_id)
                return refreshed or state
            
            # Start finalization
            print(f"[music_status] Starting finalization for job_id={job_id}", flush=True)
            update_task(job_id, status="running", progress=90, message="finalizing", result={"runpod_job_id": runpod_job_id, "output_url": st.output_url})
            
            # Finalize job in background (generate cover image, create Song record)
            payload = state.get("payload") or {}
            background_tasks.add_task(
                _finalize_runpod_job,
                job_id=job_id,
                user_id=str(state.get("user_id")),
                audio_url=st.output_url,
                payload=payload,
            )
            print(f"[music_status] Background task added for finalization: job_id={job_id}", flush=True)
    elif rp_status in ("FAILED", "CANCELLED", "TIMED_OUT"):
        update_task(job_id, status="failed", progress=100, message=f"runpod: {rp_status.lower()}", result={"runpod_job_id": runpod_job_id, "output_url": None})
    elif rp_status in ("IN_PROGRESS", "RUNNING", "EXECUTING"):
        update_task(job_id, status="running", progress=60, message="runpod: generating", result={"runpod_job_id": runpod_job_id, "output_url": None})
    elif rp_status in ("IN_QUEUE", "QUEUED"):
        update_task(job_id, status="running", progress=25, message="runpod: queued", result={"runpod_job_id": runpod_job_id, "output_url": None})
    else:
        update_task(job_id, status="running", progress=30, message=f"runpod: {rp_status.lower()}", result={"runpod_job_id": runpod_job_id, "output_url": None})

    # Return the updated state
    try:
        refreshed = get_task(job_id)
        if refreshed:
            return refreshed
    except Exception as e:
        print(f"[music_status] Error refreshing task state at end of function: {e}", flush=True)
        import traceback
        print(f"[music_status] Traceback: {traceback.format_exc()}", flush=True)
    
    # Fallback to original state if refresh fails
    return state

