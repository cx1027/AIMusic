from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class FileObject(SQLModel, table=True):
    """
    Represents a user-owned uploaded file stored in local/S3-compatible storage.

    - Drafts are private (only owner can access).
    - Published files remain private in storage, but can be shared via a FileShare token.
    """

    __tablename__ = "file_objects"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(index=True, foreign_key="users.id")

    key: str = Field(index=True, unique=True)
    content_type: str = Field(default="application/octet-stream")
    original_filename: Optional[str] = None

    status: str = Field(default="draft", index=True)  # draft | published
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


