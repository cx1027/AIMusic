#!/usr/bin/env python3
"""Initialize database tables and run all migrations.

This script is intended to run on Railway service startup.
It creates tables if they don't exist and runs all migration scripts.
"""

import os
import sys
from pathlib import Path

backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from sqlmodel import SQLModel, create_engine
from loguru import logger


def create_tables():
    """Create all tables defined in models."""
    from app.core import models  # noqa: F401 - imports all models to register them

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL environment variable is not set")
        sys.exit(1)

    engine = create_engine(database_url, pool_pre_ping=True)
    SQLModel.metadata.create_all(engine)
    logger.info("Database tables created successfully")


def run_migrations():
    """Run all migration scripts in the correct order."""
    migrations = [
        "migrate_add_username_unique",
        "migrate_add_details_column",
        "migrate_add_background_url_column",
        "migrate_update_credits_to_1000",
    ]

    for migration_name in migrations:
        try:
            logger.info(f"Running migration: {migration_name}")
            module = __import__(migration_name)
            migration_func = getattr(module, "migrate", None)
            if migration_func and callable(migration_func):
                migration_func()
            else:
                logger.warning(f"Migration {migration_name} has no migrate() function, skipping")
        except Exception as e:
            logger.error(f"Migration {migration_name} failed: {e}")
            # Continue with other migrations instead of failing completely


def main():
    logger.info("Starting database initialization...")

    # Check if already initialized (to avoid re-running on every restart)
    # Use a simple approach: check if a known table exists
    database_url = os.getenv("DATABASE_URL", "")
    if database_url:
        try:
            from sqlalchemy import create_engine, text
            engine = create_engine(database_url, pool_pre_ping=True)
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                logger.info("Database connection successful")
        except Exception as e:
            logger.warning(f"Database connection check failed: {e}")

    create_tables()
    run_migrations()

    logger.info("Database initialization completed")


if __name__ == "__main__":
    main()
