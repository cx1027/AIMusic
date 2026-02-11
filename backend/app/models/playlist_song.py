from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Field, SQLModel


class PlaylistSong(SQLModel, table=True):
    __tablename__ = "playlist_songs"

    playlist_id: UUID = Field(foreign_key="playlists.id", primary_key=True)
    song_id: UUID = Field(foreign_key="songs.id", primary_key=True)
    position: int = Field(default=0, index=True)
    added_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

