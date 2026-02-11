from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class MusicGenerationTask(SQLModel, table=True):
    __tablename__ = "music_generation_tasks"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(index=True, foreign_key="users.id")

    prompt: str
    lyrics: Optional[str] = None
    duration: int = Field(default=30)

    status: str = Field(default="queued", index=True)  # queued|running|completed|failed|cancelled
    progress: int = Field(default=0)
    message: str = Field(default="queued")

    cancel_requested: bool = Field(default=False, index=True)
    celery_task_id: Optional[str] = Field(default=None, index=True)

    result_song_id: Optional[UUID] = Field(default=None, index=True)
    result_audio_key: Optional[str] = None  # storage key (so client can use /api/files/{key})

    error: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


