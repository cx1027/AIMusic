from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Field, SQLModel


class UserFollow(SQLModel, table=True):
    """User follow relationship: follower -> following."""

    __tablename__ = "user_follows"

    follower_id: UUID = Field(primary_key=True, foreign_key="users.id", index=True)
    following_id: UUID = Field(primary_key=True, foreign_key="users.id", index=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))



