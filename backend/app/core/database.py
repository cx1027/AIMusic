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
    run_migrations()


def run_migrations() -> None:
    """Run all migration scripts in the correct order.

    These add optional columns that SQLModel.create_all() does not handle
    (columns added after initial table creation).
    """
    from loguru import logger
    from sqlalchemy import inspect, text
    import importlib

    # Switch to raw psycopg2 connection so we can issue raw DDL statements
    # without SQLModel / SQLAlchemy wrapping them in transactions.
    raw_url = settings.database_url
    if raw_url.startswith("postgresql+psycopg://"):
        raw_url = raw_url.replace("postgresql+psycopg://", "postgresql://", 1)
    elif raw_url.startswith("postgresql+asyncpg://"):
        raw_url = raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    from sqlalchemy import create_engine as _create_engine
    raw_engine = _create_engine(raw_url, pool_pre_ping=True)

    with raw_engine.connect() as conn:
        conn.execute(text("COMMIT"))  # exit any open transaction

        inspector = inspect(raw_engine)
        songs_columns = {col["name"] for col in inspector.get_columns("songs")}
        users_columns = {col["name"] for col in inspector.get_columns("users")}

        migration_modules = [
            ("migrate_add_username_unique", "users", None),
            ("migrate_add_details_column", "users", "details"),
            ("migrate_add_background_url_column", "users", "background_url"),
            ("migrate_update_credits_to_1000", None, None),
            ("migrate_add_track_share_slug", "songs", "share_slug"),
        ]

        for migration_name, table, column_hint in migration_modules:
            # Skip if the migration's target column already exists
            if column_hint:
                table_columns = songs_columns if table == "songs" else users_columns
                if column_hint in table_columns:
                    logger.info(f"Migration {migration_name}: column '{column_hint}' already exists, skipping")
                    continue
            try:
                logger.info(f"Running migration: {migration_name}")
                module = importlib.import_module(migration_name)
                if hasattr(module, "migrate"):
                    module.migrate()
                logger.info(f"Migration {migration_name} completed")
            except Exception as e:
                logger.error(f"Migration {migration_name} failed: {e}")
                raise

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


