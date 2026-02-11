from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class Share(SQLModel, table=True):
    __tablename__ = "shares"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    song_id: UUID = Field(index=True, foreign_key="songs.id")
    user_id: UUID = Field(index=True, foreign_key="users.id")

    slug: str = Field(index=True, unique=True)
    poster_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


