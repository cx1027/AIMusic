from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, ClassVar, Optional
from uuid import UUID, uuid4

from pydantic import ConfigDict
from sqlmodel import Field, SQLModel

from app.models.playlist_song import PlaylistSong
from sqlalchemy.orm import relationship

if TYPE_CHECKING:
    from app.models.playlist import Playlist


class Song(SQLModel, table=True):
    __tablename__ = "songs"
    model_config = ConfigDict(arbitrary_types_allowed=True)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(index=True, foreign_key="users.id")

    title: str = Field(default="Untitled")
    prompt: str
    lyrics: Optional[str] = None

    audio_url: Optional[str] = None
    cover_image_url: Optional[str] = None

    duration: int = Field(default=30)  # seconds
    genre: Optional[str] = None
    bpm: Optional[int] = None

    is_public: bool = Field(default=False, index=True)
    play_count: int = Field(default=0)
    like_count: int = Field(default=0)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationship - using ClassVar to prevent SQLModel from treating it as a column
    playlists: ClassVar[Any] = relationship(
        "Playlist",
        secondary="playlist_songs",
        back_populates="songs",
        lazy="selectin",
        passive_deletes=True,  # rely on DB-level cascade / existing state; don't issue DELETEs for secondary
    )


class SongCreate(SQLModel):
    title: Optional[str] = None
    prompt: str
    lyrics: Optional[str] = None
    duration: int = 30
    genre: Optional[str] = None


class SongPublic(SQLModel):
    id: UUID
    user_id: UUID
    title: str
    prompt: str
    lyrics: Optional[str] = None
    audio_url: Optional[str] = None
    duration: int
    genre: Optional[str] = None
    bpm: Optional[int] = None
    is_public: bool
    play_count: int
    like_count: int
    created_at: datetime

    # Request-scoped flags (populated in API layer, default False for type safety)
    liked_by_me: bool = False


