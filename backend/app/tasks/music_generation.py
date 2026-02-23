from __future__ import annotations

from uuid import UUID

from sqlmodel import Session

from app.core.database import engine
from app.models.user import User  # noqa: F401 - needed for foreign key resolution
from app.models.playlist_song import PlaylistSong  # noqa: F401 - needed for relationship resolution
from app.models.playlist import Playlist  # noqa: F401 - needed for relationship resolution
from app.models.song import Song
from app.services.image_gen_service import FluxNotInstalledError, generate_cover_image
from app.services.music_gen_service import generate_music
from app.services.progress_service import update_task
from app.services.storage_service import get_storage
from app.worker import celery_app


@celery_app.task(name="music_generation.run")
def run_generation_task(
    *,
    task_id: str,
    user_id: str,
    prompt: str,
    lyrics: str | None,
    duration: int,
    title: str | None = None,
    **_ignored: object,
) -> dict:
    try:
        print(f"\n{'='*80}", flush=True)
        print(f"CELERY TASK STARTED: task_id={task_id}, prompt='{prompt[:50]}...'", flush=True)
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
        report(15, "loading model")
        report(25, "generating")

        res = generate_music(prompt=prompt, lyrics=lyrics, duration=duration, progress_cb=report)

        update_task(task_id, status="running", progress=60, message="uploading audio")
        stored = get_storage().store_bytes(content=res.wav_bytes, suffix=".wav", content_type="audio/wav")

        # Generate cover image
        cover_image_url = None
        print(f"[music_generation] Starting cover image generation...", flush=True)
        try:
            report(65, "generating cover image")
            print(f"[music_generation] Calling generate_cover_image...", flush=True)
            cover_res = generate_cover_image(prompt=prompt, title=title, progress_cb=lambda p, m: report(65 + int(p * 0.15), m))
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
            song = Song(
                user_id=UUID(user_id),
                title=title or "Generated",
                prompt=prompt,
                lyrics=lyrics,
                duration=duration,
                bpm=res.bpm,
                audio_url=stored.url,
                cover_image_url=cover_image_url,
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


