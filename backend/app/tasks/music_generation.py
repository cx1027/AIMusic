from __future__ import annotations

from uuid import UUID

from sqlmodel import Session

from app.core.database import engine
from app.models.user import User  # noqa: F401 - needed for foreign key resolution
from app.models.playlist_song import PlaylistSong  # noqa: F401 - needed for relationship resolution
from app.models.playlist import Playlist  # noqa: F401 - needed for relationship resolution
from app.models.song import Song
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

        update_task(task_id, status="running", progress=90, message="uploading")
        stored = get_storage().store_bytes(content=res.wav_bytes, suffix=".wav", content_type="audio/wav")

        with Session(engine) as db:
            song = Song(
                user_id=UUID(user_id),
                title=title or "Generated",
                prompt=prompt,
                lyrics=lyrics,
                duration=duration,
                bpm=res.bpm,
                audio_url=stored.url,
            )
            db.add(song)
            db.commit()
            db.refresh(song)

        result = {"song_id": str(song.id), "audio_url": stored.url}
        update_task(task_id, status="completed", progress=100, message="completed", result=result)
        return result
    except Exception as e:
        update_task(task_id, status="failed", progress=100, message=str(e), result=None)
        raise


