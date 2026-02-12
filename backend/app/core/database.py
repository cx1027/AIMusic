from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy import text

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)


def init_db() -> None:
    # Ensure models are imported before `create_all` so their tables are registered.
    # Import order matters for relationships - link tables first, then related models
    from app.models.user import User  # noqa: F401
    from app.models.file_object import FileObject  # noqa: F401
    from app.models.file_share import FileShare  # noqa: F401
    from app.models.music_generation_task import MusicGenerationTask  # noqa: F401
    from app.models.subscription import Subscription  # noqa: F401
    from app.models.user_follow import UserFollow  # noqa: F401
    from app.models.share import Share  # noqa: F401
    # Import link table before models that use it
    from app.models.playlist_song import PlaylistSong  # noqa: F401
    from app.models.song import Song  # noqa: F401
    from app.models.playlist import Playlist  # noqa: F401
    from app.models.song_like import SongLike  # noqa: F401

    SQLModel.metadata.create_all(engine)

def check_db() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


