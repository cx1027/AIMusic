from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from uuid import UUID

from sqlmodel import Session

from app.core.database import engine
from app.models.user import User  # noqa: F401 - needed for foreign key resolution
from app.models.playlist_song import PlaylistSong  # noqa: F401 - needed for relationship resolution
from app.models.playlist import Playlist  # noqa: F401 - needed for relationship resolution
from app.models.song import Song
from app.services.image_gen_service import FluxNotInstalledError, generate_cover_image
from app.services.music_gen_service import MusicGenResult, generate_music
from app.services.ace_step_api_service import AceStepApiError, AceStepApiParams, generate_music_via_api
from app.services.progress_service import update_task
from app.services.storage_service import get_storage
from app.worker import celery_app


@celery_app.task(name="music_generation.run")
def run_generation_task(
    *,
    task_id: str,
    user_id: str,
    mode: str = "custom",
    caption: str | None = None,
    prompt: str | None = None,
    sample_query: str | None = None,
    o3ics: str | None = None,
    audio_duration: int = 60,
    thinking: bool = True,
    bpm: int | None = None,
    vocal_language: str = "en",
    audio_format: str = "mp3",
    inference_steps: int = 8,
    batch_size: int = 1,
    title: str | None = None,
    genre: str | None = None,
    instrumental: bool = False,
    **_ignored: object,
) -> dict:
    import sys
    import traceback
    
    # Log function entry
    print(f"\n{'='*80}", flush=True)
    print(f"[music_generation] FUNCTION ENTRY: run_generation_task called", flush=True)
    print(f"[music_generation] Python executable: {sys.executable}", flush=True)
    print(f"[music_generation] Task ID: {task_id}", flush=True)
    print(f"[music_generation] User ID: {user_id}", flush=True)
    print(f"[music_generation] Mode: {mode}", flush=True)
    print(f"[music_generation] Title: {title}", flush=True)
    if mode == "simple":
        print(f"[music_generation] Sample query: '{sample_query[:50] if sample_query else 'N/A'}...'", flush=True)
    else:
        effective_caption = caption or prompt
        print(f"[music_generation] Caption: '{effective_caption[:50] if effective_caption else 'N/A'}...'", flush=True)
    print(f"{'='*80}\n", flush=True)
    
    try:
        print(f"\n{'='*80}", flush=True)
        if mode == "simple":
            print(f"MUSIC GENERATION TASK STARTED: task_id={task_id}, mode=simple, sample_query='{sample_query[:50] if sample_query else 'N/A'}...'", flush=True)
        else:
            effective_caption = caption or prompt
            print(f"MUSIC GENERATION TASK STARTED: task_id={task_id}, mode=custom, caption='{effective_caption[:50] if effective_caption else 'N/A'}...'", flush=True)
        print(f"{'='*80}\n", flush=True)
        
        # Keep progress monotonic and reserve the tail for upload/db finalize.
        last_progress = 0

        def report(pct: int, msg: str) -> None:
            nonlocal last_progress
            pct_i = int(pct)
            if pct_i < last_progress:
                pct_i = last_progress
            if pct_i > 85:
                pct_i = 85
            last_progress = pct_i
            update_task(task_id, status="running", progress=pct_i, message=msg)

        report(5, "starting")
        
        # Track whether Replicate succeeded — None means fallback/local path was used
        replicate_r2_url: str | None = None

        # Use ACE-Step API instead of local inference
        effective_prompt = prompt or caption

        # Prepare cover image parameters
        cover_prompt = (caption or prompt) if mode == "custom" else (sample_query or "Generated music")
        print(f"[music_generation] ========== STARTING CONCURRENT GENERATION ==========", flush=True)
        print(f"[music_generation] Cover prompt: '{cover_prompt[:100] if cover_prompt else 'N/A'}...'", flush=True)
        print(f"[music_generation] Cover title: '{title}'", flush=True)

        # Concurrent audio and cover image generation
        res = None
        cover_res = None
        cover_image_error = None

        def audio_progress_cb(pct: int, msg: str) -> None:
            # Audio takes 0-60% progress
            report(int(pct * 0.6), msg)

        def cover_progress_cb(pct: int, msg: str) -> None:
            # Cover image takes 60-85% progress
            report(60 + int(pct * 0.25), msg)

        with ThreadPoolExecutor(max_workers=2) as executor:
            # Submit audio generation task
            api_params = AceStepApiParams(
                instrumental=instrumental,
                mode=mode,
                sample_query=sample_query,
                prompt=effective_prompt,
                o3ics=o3ics,
                thinking=thinking,
                audio_duration=audio_duration,
                bpm=bpm,
                audio_format=audio_format,
                inference_steps=inference_steps,
                batch_size=batch_size,
            )
            audio_future = executor.submit(generate_music_via_api, api_params, audio_progress_cb)

            # Submit cover image generation task
            cover_future = executor.submit(
                generate_cover_image,
                prompt=cover_prompt,
                title=title,
                progress_cb=cover_progress_cb
            )

            # Wait for audio generation result
            try:
                audio_bytes, replicate_r2_url = audio_future.result()
                print(f"[music_generation] Audio generation completed", flush=True)
                res_bpm = bpm if bpm else 120
                res = MusicGenResult(wav_bytes=audio_bytes, bpm=res_bpm)
            except AceStepApiError as e:
                print(f"[music_generation] ACE-Step API failed: {e}, falling back to local inference", flush=True)
                # Fallback to local inference
                if mode == "custom" and effective_prompt:
                    report(15, "fallback: loading local model")
                    report(25, "fallback: generating")
                    res = generate_music(prompt=effective_prompt, o3ics=o3ics, duration=audio_duration, progress_cb=audio_progress_cb)
                elif mode == "simple" and sample_query:
                    report(15, "fallback: loading local model")
                    report(25, "fallback: generating")
                    fallback_o3ics = "[Instrumental]" if instrumental else None
                    res = generate_music(prompt=sample_query, o3ics=fallback_o3ics, duration=audio_duration, progress_cb=audio_progress_cb)
                else:
                    raise RuntimeError(f"Cannot fallback: mode={mode}, prompt={prompt}, sample_query={sample_query}") from e

            # Wait for cover image generation result
            try:
                cover_res = cover_future.result()
                print(f"[music_generation] Cover image generation completed, size: {len(cover_res.image_bytes)} bytes", flush=True)
            except FluxNotInstalledError as e:
                error_msg = str(e).strip() if str(e) else "FLUX.1 Schnell is not available or not properly configured"
                if not error_msg:
                    error_msg = "FLUX.1 Schnell is not available or not properly configured"
                print(f"[music_generation] FLUX.1 Schnell not available, skipping cover image: {error_msg}", flush=True)
                cover_image_error = error_msg
            except Exception as e:
                error_msg = f"{type(e).__name__}: {str(e)}" if str(e) else f"{type(e).__name__}: Unknown error occurred"
                if not error_msg or error_msg == ": ":
                    error_msg = f"Cover image generation failed: {type(e).__name__}"
                print(f"[music_generation] Error generating cover image: {error_msg}", flush=True)
                cover_image_error = error_msg

        # Upload audio
        update_task(task_id, status="running", progress=85, message="uploading audio")
        print(f"[music_generation] Uploading audio...", flush=True)
        if replicate_r2_url is not None:
            stored_url = replicate_r2_url
            print(f"[music_generation] Audio already on R2: {stored_url}", flush=True)
        else:
            suffix = f".{audio_format}"
            content_type = f"audio/{audio_format}" if audio_format in ["mp3", "wav", "flac"] else "audio/mpeg"
            stored = get_storage().store_bytes(content=res.wav_bytes, suffix=suffix, content_type=content_type)
            stored_url = stored.url
            print(f"[music_generation] Audio uploaded successfully: {stored_url}", flush=True)

        # Upload cover image if generated
        cover_image_url = None
        if cover_res is not None:
            report(85, "uploading cover image")
            print(f"[music_generation] Uploading cover image...", flush=True)
            cover_stored = get_storage().store_bytes(content=cover_res.image_bytes, suffix=".png", content_type="image/png", folder=f"image/{date.today().isoformat()}")
            cover_image_url = cover_stored.url
            print(f"[music_generation] Cover image uploaded: {cover_image_url}", flush=True)

        update_task(task_id, status="running", progress=90, message="saving")
        with Session(engine) as db:
            # Use appropriate prompt for song record
            song_prompt = (caption or prompt) if mode == "custom" else (sample_query or "Generated")
            song = Song(
                user_id=UUID(user_id),
                title=title or "Generated",
                prompt=song_prompt,
                o3ics=o3ics,
                duration=audio_duration,
                bpm=res.bpm,
                audio_url=stored_url,
                cover_image_url=cover_image_url,
                genre=genre,
            )
            db.add(song)
            db.commit()
            db.refresh(song)

        result = {
            "song_id": str(song.id),
            "audio_url": stored_url,
            "cover_image_url": cover_image_url,
        }
        # Always include cover_image_error if it exists to ensure frontend gets the info
        if cover_image_error:
            result["cover_image_error"] = cover_image_error
            print(f"[music_generation] Adding cover_image_error to result: {cover_image_error[:100]}...", flush=True)
        else:
            print(f"[music_generation] No cover_image_error (cover_image_url={cover_image_url})", flush=True)
        print(f"[music_generation] Final result keys: {list(result.keys())}", flush=True)
        if cover_image_error:
            print(f"[music_generation] cover_image_error length: {len(cover_image_error)}", flush=True)
        # Ensure result dict is properly serialized and includes all fields
        update_task(task_id, status="completed", progress=100, message="completed", result=result)
        return result
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"[music_generation] ========== FATAL ERROR IN TASK ==========", flush=True)
        print(f"[music_generation] Error type: {type(e).__name__}", flush=True)
        print(f"[music_generation] Error message: {str(e)}", flush=True)
        print(f"[music_generation] Full traceback:\n{error_traceback}", flush=True)
        print(f"[music_generation] ========================================", flush=True)
        update_task(task_id, status="failed", progress=100, message=str(e), result=None)
        raise
