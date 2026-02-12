from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_db
from app.models.playlist import (
    Playlist,
    PlaylistCreate,
    PlaylistPublic,
    PlaylistUpdate,
    PlaylistWithSongs,
)
from app.models.playlist_song import PlaylistSong
from app.models.song import Song, SongPublic
from app.models.user import User

router = APIRouter()


@router.get("", response_model=list[PlaylistPublic])
def list_playlists(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[PlaylistPublic]:
    stmt = select(Playlist).where(Playlist.user_id == user.id).order_by(Playlist.created_at.desc())
    rows = db.exec(stmt).all()
    return [PlaylistPublic.model_validate(p, from_attributes=True) for p in rows]


@router.post("", response_model=PlaylistPublic, status_code=status.HTTP_201_CREATED)
def create_playlist(
    payload: PlaylistCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlaylistPublic:
    playlist = Playlist(user_id=user.id, name=payload.name, description=payload.description)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return PlaylistPublic.model_validate(playlist, from_attributes=True)


def _get_user_playlist(db: Session, user: User, playlist_id: UUID) -> Playlist:
    playlist = db.get(Playlist, playlist_id)
    if not playlist or playlist.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    return playlist


@router.get("/{playlist_id}", response_model=PlaylistWithSongs)
def get_playlist(
    playlist_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlaylistWithSongs:
    playlist = _get_user_playlist(db, user, playlist_id)

    link_rows = db.exec(
        select(PlaylistSong)
        .where(PlaylistSong.playlist_id == playlist.id)
        .order_by(PlaylistSong.position.asc(), PlaylistSong.added_at.asc())
    ).all()
    song_ids = [row.song_id for row in link_rows]

    songs_by_id: dict[UUID, Song] = {}
    if song_ids:
        # Get all songs in the playlist: user's own songs or public songs from others
        songs = db.exec(
            select(Song).where(
                Song.id.in_(song_ids),
                or_(Song.user_id == user.id, Song.is_public.is_(True))
            )
        ).all()
        songs_by_id = {s.id: s for s in songs}

    ordered_songs: list[SongPublic] = []
    for sid in song_ids:
        song = songs_by_id.get(sid)
        if song:
            ordered_songs.append(SongPublic.model_validate(song, from_attributes=True))

    dto = PlaylistWithSongs(
        id=playlist.id,
        name=playlist.name,
        description=playlist.description,
        created_at=playlist.created_at,
        songs=ordered_songs,
    )
    return dto


@router.patch("/{playlist_id}", response_model=PlaylistPublic)
def update_playlist(
    playlist_id: UUID,
    payload: PlaylistUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlaylistPublic:
    playlist = _get_user_playlist(db, user, playlist_id)

    if payload.name is not None:
        playlist.name = payload.name
    if payload.description is not None:
        playlist.description = payload.description

    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return PlaylistPublic.model_validate(playlist, from_attributes=True)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playlist(
    playlist_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playlist = _get_user_playlist(db, user, playlist_id)

    # Delete all playlist-song associations
    links = db.exec(select(PlaylistSong).where(PlaylistSong.playlist_id == playlist.id)).all()
    for link in links:
        db.delete(link)
    db.delete(playlist)
    db.commit()


@router.post("/{playlist_id}/songs/{song_id}", response_model=PlaylistWithSongs)
def add_song_to_playlist(
    playlist_id: UUID,
    song_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlaylistWithSongs:
    playlist = _get_user_playlist(db, user, playlist_id)

    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    # Allow adding own songs or public songs from other users
    if song.user_id != user.id and not song.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Song is not public")

    existing = db.get(PlaylistSong, (playlist.id, song.id))
    if existing:
        return get_playlist(playlist.id, db=db, user=user)

    max_position = db.exec(
        select(PlaylistSong.position)
        .where(PlaylistSong.playlist_id == playlist.id)
        .order_by(PlaylistSong.position.desc())
        .limit(1)
    ).first()
    next_pos = (max_position or 0) + 1

    link = PlaylistSong(playlist_id=playlist.id, song_id=song.id, position=next_pos)
    db.add(link)
    db.commit()
    return get_playlist(playlist.id, db=db, user=user)


@router.delete("/{playlist_id}/songs/{song_id}", response_model=PlaylistWithSongs)
def remove_song_from_playlist(
    playlist_id: UUID,
    song_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlaylistWithSongs:
    playlist = _get_user_playlist(db, user, playlist_id)
    _ = db.get(Song, song_id)  # ensure song exists; ownership covered by playlist

    link = db.get(PlaylistSong, (playlist.id, song_id))
    if link:
        db.delete(link)
        db.commit()

    return get_playlist(playlist.id, db=db, user=user)

