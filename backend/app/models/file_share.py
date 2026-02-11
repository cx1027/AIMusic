from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class FileShare(SQLModel, table=True):
    __tablename__ = "file_shares"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    file_object_id: UUID = Field(index=True, foreign_key="file_objects.id")
    user_id: UUID = Field(index=True, foreign_key="users.id")

    slug: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    revoked_at: Optional[datetime] = Field(default=None, index=True)
    expires_at: Optional[datetime] = Field(default=None, index=True)
    access_count: int = Field(default=0)


