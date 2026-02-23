#!/usr/bin/env python3
"""Migration script to add the 'background_url' column to the users table, if missing."""

import os
import sys
from pathlib import Path

from sqlalchemy import text, inspect, create_engine

# Add the backend directory to the path (for consistency with other migrate_* scripts)
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Get database URL from environment or use default (matches DATABASE_ACCESS_GUIDE.md)
database_url = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://aimusic:aimusic@localhost:5432/aimusic",
)

engine = create_engine(database_url, pool_pre_ping=True)


def migrate() -> None:
    """Add the 'background_url' column to the users table if it doesn't exist."""
    with engine.connect() as conn:
        inspector = inspect(engine)
        columns = [col["name"] for col in inspector.get_columns("users")]

        if "background_url" in columns:
            print("✅ Column 'background_url' already exists in 'users' table.")
            return

        print("Adding 'background_url' column to 'users' table...")
        conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN background_url TEXT
                """
            )
        )
        conn.commit()
        print("✅ Successfully added 'background_url' column to 'users' table.")


if __name__ == "__main__":
    migrate()

