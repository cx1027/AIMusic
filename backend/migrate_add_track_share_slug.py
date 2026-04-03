"""
Add share_slug and is_public_share columns to the songs table.

Usage:
    python -m migrate_add_track_share_slug
"""
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, inspect, text


def migrate():
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://aimusic:aimusic@localhost:5432/aimusic",
    )

    engine = create_engine(database_url, pool_pre_ping=True)

    with engine.connect() as conn:
        conn.execute(text("COMMIT"))  # ensure we're not in a transaction

        inspector = inspect(engine)
        columns = [col["name"] for col in inspector.get_columns("songs")]

        if "share_slug" not in columns:
            conn.execute(text("""
                ALTER TABLE songs
                ADD COLUMN share_slug VARCHAR
            """))
            conn.execute(text("""
                CREATE UNIQUE INDEX ix_songs_share_slug
                ON songs (share_slug)
                WHERE share_slug IS NOT NULL
            """))
            print("✅ Added 'share_slug' column and unique index")
        else:
            print("ℹ️  Column 'share_slug' already exists")

        if "is_public_share" not in columns:
            conn.execute(text("""
                ALTER TABLE songs
                ADD COLUMN is_public_share BOOLEAN NOT NULL DEFAULT FALSE
            """))
            print("✅ Added 'is_public_share' column")
        else:
            print("ℹ️  Column 'is_public_share' already exists")

        conn.commit()
    print("Migration complete")


if __name__ == "__main__":
    migrate()
