from __future__ import annotations

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "aimusic",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.music_generation"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Use solo pool to avoid forking issues with large ML models
    # Solo pool runs in the main process (no forking), which is safer for ML models
    # that consume significant memory. Trade-off: only one task at a time.
    worker_pool="solo",
    # Alternative: use threads pool if you need concurrency (but may have issues with MPS/CUDA)
    # worker_pool="threads",
    # worker_threads=1,  # Use with threads pool
)


