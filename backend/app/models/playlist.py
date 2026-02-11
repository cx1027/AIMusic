from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

from .playlist_song import PlaylistSong


class PlaylistBase(SQLModel):
    name: str
    description: Optional[str] = None


class Playlist(PlaylistBase, table=True):
    __tablename__ = "playlists"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(index=True, foreign_key="users.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    songs: list["Song"] = Relationship(
        back_populates="playlists",
        link_model=PlaylistSong,
        sa_relationship_kwargs={
            "order_by": "PlaylistSong.position",
            "lazy": "selectin",
        },
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

