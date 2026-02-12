#!/usr/bin/env python3
"""Migration script to update all users' credits_balance to 1000."""

import os
import sys
from pathlib import Path

# Add the backend directory to the path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text, create_engine

# Get database URL from environment or use default
database_url = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://aimusic:aimusic@localhost:5432/aimusic"
)

engine = create_engine(database_url, pool_pre_ping=True)

def migrate():
    """Update all users' credits_balance to 1000."""
    with engine.connect() as conn:
        # Count users before update
        result = conn.execute(text("SELECT COUNT(*) FROM users"))
        user_count = result.scalar()
        
        if user_count == 0:
            print("No users found in database. New users will get 1000 credits by default.")
            return
        
        print(f"Found {user_count} user(s). Updating credits_balance to 1000...")
        
        # Update all users to have 1000 credits
        result = conn.execute(text("""
            UPDATE users 
            SET credits_balance = 1000
        """))
        conn.commit()
        
        updated_count = result.rowcount
        print(f"✅ Successfully updated {updated_count} user(s) to have 1000 credits.")

if __name__ == "__main__":
    migrate()

