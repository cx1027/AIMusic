#!/usr/bin/env python3
"""Migration script to add unique constraint to the 'username' column in the users table."""

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
    """Add unique constraint to the 'username' column in the users table."""
    with engine.connect() as conn:
        inspector = inspect(engine)
        
        # Check if unique constraint already exists
        unique_constraints = inspector.get_unique_constraints('users')
        username_unique_exists = any(
            'username' in constraint['column_names'] 
            for constraint in unique_constraints
        )
        
        if username_unique_exists:
            print("✅ Unique constraint on 'username' already exists in 'users' table.")
            return
        
        # Check for duplicate usernames before adding constraint
        print("Checking for duplicate usernames...")
        result = conn.execute(text("""
            SELECT username, COUNT(*) as count
            FROM users
            GROUP BY username
            HAVING COUNT(*) > 1
        """))
        duplicates = result.fetchall()
        
        if duplicates:
            print("⚠️  WARNING: Found duplicate usernames:")
            for username, count in duplicates:
                print(f"   - '{username}': {count} occurrences")
            print("\nPlease resolve duplicates before adding unique constraint.")
            print("You can update usernames manually or use a script to append numbers.")
            return
        
        # Add the unique constraint
        print("Adding unique constraint to 'username' column in 'users' table...")
        conn.execute(text("""
            ALTER TABLE users 
            ADD CONSTRAINT users_username_unique UNIQUE (username)
        """))
        conn.commit()
        print("✅ Successfully added unique constraint to 'username' column in 'users' table.")

if __name__ == "__main__":
    migrate()

