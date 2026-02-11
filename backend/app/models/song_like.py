from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Field, SQLModel


class SongLike(SQLModel, table=True):
    """Join table recording which user liked which song."""

    __tablename__ = "song_likes"

    user_id: UUID = Field(primary_key=True, foreign_key="users.id", index=True)
    song_id: UUID = Field(primary_key=True, foreign_key="songs.id", index=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))



