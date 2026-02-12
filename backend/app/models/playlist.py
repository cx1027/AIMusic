from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, ClassVar, Optional
from uuid import UUID, uuid4

from pydantic import ConfigDict
from sqlmodel import Field, SQLModel
from sqlalchemy.orm import relationship

from .playlist_song import PlaylistSong

if TYPE_CHECKING:
    from .song import Song


class PlaylistBase(SQLModel):
    name: str
    description: Optional[str] = None


class Playlist(PlaylistBase, table=True):
    __tablename__ = "playlists"
    model_config = ConfigDict(arbitrary_types_allowed=True)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(index=True, foreign_key="users.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationship - using ClassVar to prevent SQLModel from treating it as a column
    songs: ClassVar[Any] = relationship(
        "Song",
        secondary="playlist_songs",
        back_populates="playlists",
        lazy="selectin"
    )


class PlaylistCreate(PlaylistBase):
    pass


class PlaylistUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None


class PlaylistPublic(PlaylistBase):
    id: UUID
    created_at: datetime


class PlaylistWithSongs(PlaylistPublic):
    songs: list["SongPublic"]


# Import at the end to resolve forward references for Pydantic schema generation
from .song import SongPublic  # noqa: E402

# Rebuild model to resolve forward references
PlaylistWithSongs.model_rebuild()

