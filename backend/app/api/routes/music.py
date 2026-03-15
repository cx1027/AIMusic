from __future__ import annotations

import logging
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
from app.services.image_gen_service import FluxNotInstalledError, download_image_from_url, generate_cover_image, get_runpod_image_status, submit_runpod_image_job
from app.services.progress_service import get_task, init_task, update_task
from app.services.runpod_music_service import RunPodError, get_runpod_status, submit_runpod_job
from app.services.storage_service import get_storage

logger = logging.getLogger(__name__)

router = APIRouter()


def _coerce_int(value: Any, *, default: int) -> int:
    """Coerce value to int; return default on None/invalid."""
    if value is None:
        return default
    try:
        return int(value)
    except Exception:
        return default


def _coerce_float(value: Any, *, default: float) -> float:
    """Coerce value to float; return default on None/invalid."""
    if value is None:
        return default
    try:
        return float(value)
    except Exception:
        return default


def _coerce_str(value: Any, *, default: str) -> str:
    """Coerce value to str; return default on None/blank."""
    if value is None:
        return default
    s = str(value).strip()
    return s if s else default


def _log_runpod_input(*, mode: str, runpod_input: Dict[str, Any]) -> None:
    """Log the RunPod 'input' payload (truncate long text fields)."""
    safe = dict(runpod_input)
    for k in ("prompt", "caption", "sample_query", "lyrics"):
        if k in safe and safe[k] is not None:
            s = str(safe[k])
            if len(s) > 240:
                safe[k] = s[:240] + "...(truncated)"
    logger.info("[runpod] final input payload (mode=%s): %s", mode, safe)


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
        prompt = ""
        caption = ""
        lyrics = None
    else:
        caption = (payload.get("caption") or "").strip()
        if not caption:
            # Back-compat with older clients
            caption = (payload.get("prompt") or "").strip()
        if not caption:
            raise HTTPException(status_code=400, detail="caption is required for custom mode")
        lyrics_raw = payload.get("lyrics")
        lyrics = str(lyrics_raw).strip() if lyrics_raw is not None else ""
        if not lyrics:
            raise HTTPException(status_code=400, detail="lyrics is required for custom mode")
        sample_query = None
        prompt = caption  # Back-compat: use caption as prompt

    # Optional fields (pass-through to RunPod input)
    title = payload.get("title")
    genre = payload.get("genre")
    thinking = bool(payload.get("thinking", True))
    instrumental = bool(payload.get("instrumental", False))
    # Support both `audio_duration` (frontend) and `duration` (common RunPod examples)
    audio_duration = payload.get("audio_duration", payload.get("duration", 60))
    try:
        audio_duration_int = int(audio_duration)
    except Exception:
        raise HTTPException(status_code=400, detail="audio_duration must be an integer")
    if audio_duration_int < 10 or audio_duration_int > 600:
        raise HTTPException(status_code=400, detail="audio_duration out of range (10-600)")

    bpm = payload.get("bpm")
    bpm_int_raw = _coerce_int(bpm, default=140)
    bpm_int = bpm_int_raw if bpm_int_raw > 0 else 140

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

    # Mandatory RunPod fields per RunPod_JSON_Inputs.md (ensure no None leaks)
    keyscale = _coerce_str(payload.get("keyscale"), default="A minor")
    timesignature = _coerce_str(payload.get("timesignature"), default="4/4")
    lm_temperature = _coerce_float(payload.get("lm_temperature"), default=0.85)
    lm_top_p = _coerce_float(payload.get("lm_top_p"), default=0.9)
    lm_top_k = _coerce_int(payload.get("lm_top_k"), default=50)
    lm_cfg_scale = _coerce_float(payload.get("lm_cfg_scale"), default=2.5)
    guidance_scale = _coerce_float(payload.get("guidance_scale"), default=7.0)
    seed = _coerce_int(payload.get("seed"), default=42)

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
            "caption": caption,
            "prompt": prompt,
            "sample_query": sample_query,
            "lyrics": lyrics,
            "thinking": thinking,
            "instrumental": instrumental,
            "audio_duration": audio_duration_int,
            "bpm": bpm_int,
            "keyscale": keyscale,
            "timesignature": timesignature,
            "vocal_language": vocal_language,
            "audio_format": audio_format,
            "lm_temperature": lm_temperature,
            "lm_top_p": lm_top_p,
            "lm_top_k": lm_top_k,
            "lm_cfg_scale": lm_cfg_scale,
            "inference_steps": inference_steps_int,
            "guidance_scale": guidance_scale,
            "seed": seed,
            "batch_size": batch_size_int,
        },
    )

    # Submit到 RunPod Serverless。
    # RunPod Job input 需遵循 Runpod_API_DOC.md：
    # - Simple Mode（前端的 Simple）：我们用 sample_query 触发 sample_query 模式（LLM 自动推理 caption/lyrics/metas）
    # - Custom Mode（前端的 Custom）：mode="custom" + prompt + lyrics（本项目允许 lyrics 可选；缺省则用 [Instrumental]）
    update_task(job_id, status="running", progress=5, message="runpod: submitting")
    
    # Prepare prompts (used for cover generation)
    cover_prompt = caption if mode == "custom" else (sample_query or "Generated music")
    
    # Submit music generation job
    try:
        # Build RunPod input according to RunPod_JSON_Inputs.md
        runpod_input: Dict[str, Any] = {}

        # Common mandatory fields per RunPod_JSON_Inputs.md
        runpod_input["duration"] = audio_duration_int
        runpod_input["thinking"] = thinking
        runpod_input["vocal_language"] = vocal_language
        runpod_input["audio_format"] = audio_format
        runpod_input["bpm"] = bpm_int
        runpod_input["keyscale"] = keyscale
        runpod_input["timesignature"] = timesignature
        runpod_input["lm_temperature"] = lm_temperature
        runpod_input["lm_top_p"] = lm_top_p
        runpod_input["lm_top_k"] = lm_top_k
        runpod_input["lm_cfg_scale"] = lm_cfg_scale
        runpod_input["inference_steps"] = inference_steps_int
        runpod_input["guidance_scale"] = guidance_scale
        runpod_input["seed"] = seed
        runpod_input["batch_size"] = batch_size_int

        if mode == "simple":
            if instrumental:
                # Simple UI + instrumental => RunPod JSON "simple mode"
                runpod_input["mode"] = "simple"
                runpod_input["prompt"] = sample_query
                runpod_input["lyrics"] = "[Instrumental]"
            else:
                # Simple UI => RunPod JSON "sample_query mode"
                runpod_input["sample_query"] = sample_query
        else:
            # Frontend Custom Mode => RunPod JSON "custom mode"
            runpod_input["mode"] = "custom"
            runpod_input["caption"] = caption
            runpod_input["lyrics"] = lyrics

        _log_runpod_input(mode=mode, runpod_input=runpod_input)
        submit_res = submit_runpod_job(input_payload=runpod_input)
    except RunPodError as e:
        update_task(job_id, status="failed", progress=100, message=str(e), result=None)
        raise HTTPException(status_code=502, detail=str(e))
    
    # Submit cover image generation job in parallel
    cover_image_job_id = None
    cover_image_error = None
    try:
        cover_submit_res = submit_runpod_image_job(prompt=cover_prompt, title=title)
        cover_image_job_id = cover_submit_res.runpod_job_id
        logger.info(f"[music_generate] Cover image job submitted: {cover_image_job_id}")
    except FluxNotInstalledError as e:
        # If FLUX is not available, we'll skip cover image generation
        cover_image_error = str(e)
        logger.warning(f"[music_generate] Cover image generation not available: {cover_image_error}")
    except Exception as e:
        # Log error but don't fail the whole request
        cover_image_error = f"Failed to submit cover image job: {str(e)}"
        logger.error(f"[music_generate] Error submitting cover image job: {e}", exc_info=True)

    update_task(
        job_id,
        status="running",
        progress=10,
        message="runpod: queued",
        result={
            "runpod_job_id": submit_res.runpod_job_id,
            "runpod_image_job_id": cover_image_job_id,
            "output_url": None,
            "cover_image_url": None,
            "cover_image_error": cover_image_error,
        },
    )
    return {
        "job_id": job_id,
        "runpod_job_id": submit_res.runpod_job_id,
        "runpod_image_job_id": cover_image_job_id,
    }


def _finalize_runpod_job(
    *,
    job_id: str,
    user_id: str,
    audio_url: str,
    cover_image_url: Optional[str] = None,
    payload: Dict[str, Any],
) -> None:
    """
    Finalize a completed RunPod job by:
    1. Downloading cover image from RunPod (if provided) or generating it as fallback
    2. Creating Song record in database
    3. Updating task result with song_id and cover_image_url
    """
    import traceback
    
    print(f"\n{'='*80}", flush=True)
    print(f"[music_status] FINALIZING JOB: job_id={job_id}", flush=True)
    print(f"[music_status] Audio URL: {audio_url}", flush=True)
    print(f"[music_status] Cover Image URL: {cover_image_url or 'None (will generate)'}", flush=True)
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
        
        # Use cover image URL directly from RunPod (already an R2 URL) or generate fallback
        final_cover_image_url = None
        cover_image_error = None
        
        if cover_image_url:
            # Check if the URL is already a valid, accessible R2 URL
            # RunPod returns R2 URLs that are already public and accessible
            if cover_image_url.startswith(("http://", "https://")):
                # Use the R2 URL directly - no need to download and re-upload
                print(f"[music_status] ========== USING COVER IMAGE URL DIRECTLY FROM R2 ==========", flush=True)
                print(f"[music_status] Using R2 URL: {cover_image_url}", flush=True)
                final_cover_image_url = cover_image_url
                print(f"[music_status] Cover image URL set: {final_cover_image_url}", flush=True)
            else:
                # Invalid URL format, try to download and re-upload
                try:
                    print(f"[music_status] ========== DOWNLOADING COVER IMAGE FROM RUNPOD ==========", flush=True)
                    print(f"[music_status] Downloading from: {cover_image_url}", flush=True)
                    image_bytes = download_image_from_url(cover_image_url)
                    print(f"[music_status] Cover image downloaded successfully, size: {len(image_bytes)} bytes", flush=True)
                    cover_stored = get_storage().store_bytes(content=image_bytes, suffix=".png", content_type="image/png")
                    final_cover_image_url = cover_stored.url
                    print(f"[music_status] Cover image uploaded: {final_cover_image_url}", flush=True)
                except Exception as e:
                    error_msg = f"Failed to download cover image: {type(e).__name__}: {str(e)}"
                    print(f"[music_status] Error downloading cover image: {error_msg}", flush=True)
                    print(f"[music_status] Traceback: {traceback.format_exc()}", flush=True)
                    cover_image_error = error_msg
                    # Fallback to generating cover image
                    print(f"[music_status] Falling back to generating cover image...", flush=True)
                    try:
                        cover_res = generate_cover_image(prompt=cover_prompt, title=title)
                        print(f"[music_status] Cover image generated successfully, size: {len(cover_res.image_bytes)} bytes", flush=True)
                        cover_stored = get_storage().store_bytes(content=cover_res.image_bytes, suffix=".png", content_type="image/png")
                        final_cover_image_url = cover_stored.url
                        print(f"[music_status] Cover image uploaded: {final_cover_image_url}", flush=True)
                        cover_image_error = None  # Clear error since fallback succeeded
                    except Exception as e2:
                        error_msg2 = f"{type(e2).__name__}: {str(e2)}" if str(e2) else f"{type(e2).__name__}: Unknown error occurred"
                        print(f"[music_status] Error generating cover image (fallback): {error_msg2}", flush=True)
                        print(f"[music_status] Traceback: {traceback.format_exc()}", flush=True)
                        cover_image_error = f"{cover_image_error}; fallback generation also failed: {error_msg2}"
        else:
            # Generate cover image (fallback if RunPod image generation was not available)
            try:
                print(f"[music_status] ========== GENERATING COVER IMAGE (FALLBACK) ==========", flush=True)
                print(f"[music_status] Calling generate_cover_image...", flush=True)
                cover_res = generate_cover_image(prompt=cover_prompt, title=title)
                print(f"[music_status] Cover image generated successfully, size: {len(cover_res.image_bytes)} bytes", flush=True)
                cover_stored = get_storage().store_bytes(content=cover_res.image_bytes, suffix=".png", content_type="image/png")
                final_cover_image_url = cover_stored.url
                print(f"[music_status] Cover image uploaded: {final_cover_image_url}", flush=True)
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
                cover_image_url=final_cover_image_url,
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
            "cover_image_url": final_cover_image_url,
        }
        if cover_image_error:
            result["cover_image_error"] = cover_image_error
            print(f"[music_status] Adding cover_image_error to result: {cover_image_error[:100]}...", flush=True)
        
        print(f"[music_status] Final result before update_task: cover_image_url={final_cover_image_url}, result keys={list(result.keys())}", flush=True)
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

    # Extract runpod job ids (only needed if not finalized)
    runpod_job_id = None
    runpod_image_job_id = None
    if isinstance(state.get("result"), dict):
        runpod_job_id = state["result"].get("runpod_job_id")
        runpod_image_job_id = state["result"].get("runpod_image_job_id")
    if not runpod_job_id and isinstance(state.get("payload"), dict):
        runpod_job_id = state["payload"].get("runpod_job_id")

    if not runpod_job_id:
        update_task(job_id, status="failed", progress=100, message="missing runpod_job_id", result=None)
        raise HTTPException(status_code=500, detail="job state corrupted (missing runpod_job_id)")

    # Poll music generation job
    try:
        st = get_runpod_status(runpod_job_id=str(runpod_job_id))
    except RunPodError as e:
        # Don't flip to failed on transient status fetch errors; just surface it.
        raise HTTPException(status_code=502, detail=str(e))
    
    # Poll image generation job (if it exists)
    image_status = None
    image_url = None
    if runpod_image_job_id:
        try:
            image_status = get_runpod_image_status(runpod_job_id=str(runpod_image_job_id))
            if image_status.status == "COMPLETED" and image_status.image_url:
                image_url = image_status.image_url
                # Update result with image URL
                current_result = state.get("result") or {}
                if isinstance(current_result, dict):
                    current_result["cover_image_url"] = image_url
                    update_task(job_id, status=current_status or "running", progress=state.get("progress", 0), message=state.get("message", ""), result=current_result)
        except FluxNotInstalledError as e:
            logger.warning(f"[music_status] Error polling image job: {e}")
        except Exception as e:
            logger.warning(f"[music_status] Error polling image job: {e}", exc_info=True)
    
    # Map RunPod music status -> our status/progress
    rp_status = (st.status or "UNKNOWN").upper()
    image_rp_status = (image_status.status if image_status else "UNKNOWN").upper() if runpod_image_job_id else None
    
    # Calculate overall progress based on both jobs
    music_progress = 0
    image_progress = 0
    if rp_status in ("COMPLETED", "SUCCEEDED", "SUCCESS"):
        music_progress = 100
    elif rp_status in ("IN_PROGRESS", "RUNNING", "EXECUTING"):
        music_progress = 60
    elif rp_status in ("IN_QUEUE", "QUEUED"):
        music_progress = 25
    else:
        music_progress = 30
    
    if runpod_image_job_id:
        if image_rp_status in ("COMPLETED", "SUCCEEDED", "SUCCESS"):
            image_progress = 100
        elif image_rp_status in ("IN_PROGRESS", "RUNNING", "EXECUTING"):
            image_progress = 60
        elif image_rp_status in ("IN_QUEUE", "QUEUED"):
            image_progress = 25
        else:
            image_progress = 30
        
        # Overall progress is average of both (weighted: music 70%, image 30%)
        overall_progress = int((music_progress * 0.7) + (image_progress * 0.3))
    else:
        overall_progress = music_progress
    
    # Determine status message
    if rp_status in ("COMPLETED", "SUCCEEDED", "SUCCESS"):
        if not st.output_url:
            update_task(job_id, status="failed", progress=100, message="runpod: completed but missing output_url", result={"runpod_job_id": runpod_job_id, "runpod_image_job_id": runpod_image_job_id, "output_url": None})
        else:
            # Check if both jobs are complete
            both_complete = (
                rp_status in ("COMPLETED", "SUCCEEDED", "SUCCESS") and
                (not runpod_image_job_id or image_rp_status in ("COMPLETED", "SUCCEEDED", "SUCCESS"))
            )
            
            if both_complete:
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
                logger.info(f"[music_status] Starting finalization for job_id={job_id}")
                update_task(
                    job_id,
                    status="running",
                    progress=90,
                    message="finalizing",
                    result={
                        "runpod_job_id": runpod_job_id,
                        "runpod_image_job_id": runpod_image_job_id,
                        "output_url": st.output_url,
                        "cover_image_url": image_url,
                    },
                )
                
                # Finalize job in background (download cover image, create Song record)
                payload = state.get("payload") or {}
                background_tasks.add_task(
                    _finalize_runpod_job,
                    job_id=job_id,
                    user_id=str(state.get("user_id")),
                    audio_url=st.output_url,
                    cover_image_url=image_url,
                    payload=payload,
                )
                logger.info(f"[music_status] Background task added for finalization: job_id={job_id}")
            else:
                # Music complete but image still processing
                status_msg = "runpod: music complete, generating cover"
                update_task(
                    job_id,
                    status="running",
                    progress=overall_progress,
                    message=status_msg,
                    result={
                        "runpod_job_id": runpod_job_id,
                        "runpod_image_job_id": runpod_image_job_id,
                        "output_url": st.output_url,
                        "cover_image_url": image_url,
                    },
                )
    elif rp_status in ("FAILED", "CANCELLED", "TIMED_OUT"):
        update_task(
            job_id,
            status="failed",
            progress=100,
            message=f"runpod: {rp_status.lower()}",
            result={"runpod_job_id": runpod_job_id, "runpod_image_job_id": runpod_image_job_id, "output_url": None},
        )
    elif rp_status in ("IN_PROGRESS", "RUNNING", "EXECUTING"):
        status_msg = "runpod: generating music"
        if runpod_image_job_id:
            if image_rp_status in ("IN_PROGRESS", "RUNNING", "EXECUTING"):
                status_msg = "runpod: generating music and cover"
            elif image_rp_status in ("IN_QUEUE", "QUEUED"):
                status_msg = "runpod: generating music, cover queued"
        update_task(
            job_id,
            status="running",
            progress=overall_progress,
            message=status_msg,
            result={
                "runpod_job_id": runpod_job_id,
                "runpod_image_job_id": runpod_image_job_id,
                "output_url": None,
                "cover_image_url": image_url,
            },
        )
    elif rp_status in ("IN_QUEUE", "QUEUED"):
        status_msg = "runpod: queued"
        if runpod_image_job_id:
            status_msg = "runpod: music and cover queued"
        update_task(
            job_id,
            status="running",
            progress=overall_progress,
            message=status_msg,
            result={
                "runpod_job_id": runpod_job_id,
                "runpod_image_job_id": runpod_image_job_id,
                "output_url": None,
                "cover_image_url": image_url,
            },
        )
    else:
        update_task(
            job_id,
            status="running",
            progress=overall_progress,
            message=f"runpod: {rp_status.lower()}",
            result={
                "runpod_job_id": runpod_job_id,
                "runpod_image_job_id": runpod_image_job_id,
                "output_url": None,
                "cover_image_url": image_url,
            },
        )

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

