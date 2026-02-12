#!/usr/bin/env python3
"""Migration script to add the 'details' column to the users table."""

import os
import sys
from pathlib import Path

# Add the backend directory to the path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text, inspect, create_engine

# Get database URL from environment or use default
database_url = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://aimusic:aimusic@localhost:5432/aimusic"
)

engine = create_engine(database_url, pool_pre_ping=True)

def migrate():
    """Add the 'details' column to the users table if it doesn't exist."""
    with engine.connect() as conn:
        # Check if the column already exists
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('users')]
        
        if 'details' in columns:
            print("✅ Column 'details' already exists in 'users' table.")
            return
        
        # Add the column
        print("Adding 'details' column to 'users' table...")
        conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN details TEXT DEFAULT ''
        """))
        conn.commit()
        print("✅ Successfully added 'details' column to 'users' table.")

if __name__ == "__main__":
    migrate()

