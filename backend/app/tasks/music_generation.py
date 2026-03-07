from __future__ import annotations

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
    prompt: str | None = None,
    sample_query: str | None = None,
    lyrics: str | None = None,
    audio_duration: int = 60,
    thinking: bool = True,
    bpm: int | None = None,
    vocal_language: str = "en",
    audio_format: str = "mp3",
    inference_steps: int = 8,
    batch_size: int = 1,
    title: str | None = None,
    genre: str | None = None,
    **_ignored: object,
) -> dict:
    try:
        print(f"\n{'='*80}", flush=True)
        if mode == "simple":
            print(f"CELERY TASK STARTED: task_id={task_id}, mode=simple, sample_query='{sample_query[:50] if sample_query else 'N/A'}...'", flush=True)
        else:
            print(f"CELERY TASK STARTED: task_id={task_id}, mode=custom, prompt='{prompt[:50] if prompt else 'N/A'}...'", flush=True)
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
        
        # Use ACE-Step API instead of local inference
        try:
            report(10, "calling ACE-Step API")
            api_params = AceStepApiParams(
                mode=mode,
                sample_query=sample_query,
                prompt=prompt,
                lyrics=lyrics,
                thinking=thinking,
                audio_duration=audio_duration,
                bpm=bpm,
                vocal_language=vocal_language,
                audio_format=audio_format,
                inference_steps=inference_steps,
                batch_size=batch_size,
            )
            audio_bytes = generate_music_via_api(api_params, progress_cb=report)
            # API returns audio in the requested format (MP3, WAV, etc.)
            # For MusicGenResult, we use wav_bytes field but it can contain any audio format
            res_bpm = bpm if bpm else 120  # Use provided BPM or default
            res = MusicGenResult(wav_bytes=audio_bytes, bpm=res_bpm)
        except AceStepApiError as e:
            print(f"[music_generation] ACE-Step API failed: {e}, falling back to local inference", flush=True)
            # Fallback to local inference if API fails
            if mode == "custom" and prompt:
                report(15, "fallback: loading local model")
                report(25, "fallback: generating")
                res = generate_music(prompt=prompt, lyrics=lyrics, duration=audio_duration, progress_cb=report)
            elif mode == "simple" and sample_query:
                report(15, "fallback: loading local model")
                report(25, "fallback: generating")
                # Use sample_query as prompt for simple mode fallback
                res = generate_music(prompt=sample_query, lyrics=None, duration=audio_duration, progress_cb=report)
            else:
                raise RuntimeError(f"Cannot fallback: mode={mode}, prompt={prompt}, sample_query={sample_query}") from e

        update_task(task_id, status="running", progress=60, message="uploading audio")
        # Use the requested audio format for storage
        suffix = f".{audio_format}"
        content_type = f"audio/{audio_format}" if audio_format in ["mp3", "wav", "flac"] else "audio/mpeg"
        stored = get_storage().store_bytes(content=res.wav_bytes, suffix=suffix, content_type=content_type)

        # Generate cover image
        cover_image_url = None
        print(f"[music_generation] Starting cover image generation...", flush=True)
        try:
            report(65, "generating cover image")
            print(f"[music_generation] Calling generate_cover_image...", flush=True)
            # Use appropriate prompt for cover image
            cover_prompt = prompt if mode == "custom" else (sample_query or "Generated music")
            cover_res = generate_cover_image(prompt=cover_prompt, title=title, progress_cb=lambda p, m: report(65 + int(p * 0.15), m))
            print(f"[music_generation] Cover image generated successfully, size: {len(cover_res.image_bytes)} bytes", flush=True)
            report(80, "uploading cover image")
            cover_stored = get_storage().store_bytes(content=cover_res.image_bytes, suffix=".png", content_type="image/png")
            cover_image_url = cover_stored.url
            print(f"[music_generation] Cover image uploaded: {cover_image_url}", flush=True)
        except FluxNotInstalledError as e:
            print(f"[music_generation] FLUX.1 Schnell not available, skipping cover image: {e}", flush=True)
            import traceback
            print(f"[music_generation] Traceback: {traceback.format_exc()}", flush=True)
        except Exception as e:
            print(f"[music_generation] Error generating cover image: {type(e).__name__}: {e}", flush=True)
            import traceback
            print(f"[music_generation] Traceback: {traceback.format_exc()}", flush=True)
            # Continue without cover image if generation fails

        update_task(task_id, status="running", progress=90, message="saving")
        with Session(engine) as db:
            # Use appropriate prompt for song record
            song_prompt = prompt if mode == "custom" else (sample_query or "Generated")
            song = Song(
                user_id=UUID(user_id),
                title=title or "Generated",
                prompt=song_prompt,
                lyrics=lyrics,
                duration=audio_duration,
                bpm=res.bpm,
                audio_url=stored.url,
                cover_image_url=cover_image_url,
                genre=genre,
            )
            db.add(song)
            db.commit()
            db.refresh(song)

        result = {"song_id": str(song.id), "audio_url": stored.url, "cover_image_url": cover_image_url}
        update_task(task_id, status="completed", progress=100, message="completed", result=result)
        return result
    except Exception as e:
        update_task(task_id, status="failed", progress=100, message=str(e), result=None)
        raise


