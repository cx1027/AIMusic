from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, or_
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_db
from app.models.playlist_song import PlaylistSong
from app.models.song import Song, SongCreate, SongPublic
from app.models.song_like import SongLike
from app.models.user import User

router = APIRouter()


class SongVisibilityUpdate(BaseModel):
    is_public: bool


@router.get("", response_model=list[SongPublic])
def list_songs(
    q: str | None = None,
    genre: str | None = None,
    order: str = "newest",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SongPublic]:
    stmt = select(Song).where(Song.user_id == user.id)

    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Song.title.ilike(like), Song.prompt.ilike(like)))

    if genre:
        stmt = stmt.where(Song.genre == genre)

    if order == "oldest":
        stmt = stmt.order_by(Song.created_at.asc())
    elif order == "popular":
        stmt = stmt.order_by(Song.play_count.desc())
    else:
        stmt = stmt.order_by(Song.created_at.desc())

    songs = db.exec(stmt).all()

    # Preload like state for current user
    if not songs:
        return []

    song_ids = [s.id for s in songs]
    likes = db.exec(
        select(SongLike.song_id).where(
            SongLike.user_id == user.id,
            SongLike.song_id.in_(song_ids),
        )
    ).all()
    liked_ids = {row[0] for row in likes}

    out: list[SongPublic] = []
    for s in songs:
        sp = SongPublic.model_validate(s, from_attributes=True)
        sp.liked_by_me = s.id in liked_ids
        out.append(sp)
    return out


@router.post("", response_model=SongPublic, status_code=status.HTTP_201_CREATED)
def create_song(
    payload: SongCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SongPublic:
    song = Song(
        user_id=user.id,
        title=payload.title or "Untitled",
        prompt=payload.prompt,
        lyrics=payload.lyrics,
        duration=payload.duration,
        genre=payload.genre,
    )
    db.add(song)
    db.commit()
    db.refresh(song)
    return SongPublic.model_validate(song, from_attributes=True)


@router.get("/{song_id}", response_model=SongPublic)
def get_song(
    song_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SongPublic:
    song = db.get(Song, song_id)
    if not song or song.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    liked = db.exec(
        select(SongLike).where(
            SongLike.user_id == user.id,
            SongLike.song_id == song_id,
        )
    ).first()
    song_public = SongPublic.model_validate(song, from_attributes=True)
    song_public.liked_by_me = liked is not None
    return song_public


@router.post("/{song_id}/like")
def toggle_like_song(
    song_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Toggle like for a song by the current user and return updated counts."""
    song = db.get(Song, song_id)
    if not song or (not song.is_public and song.user_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")

    existing = db.exec(
        select(SongLike).where(
            SongLike.user_id == user.id,
            SongLike.song_id == song_id,
        )
    ).first()

    if existing:
        # Unlike
        db.delete(existing)
        song.like_count = max(song.like_count - 1, 0)
        liked = False
    else:
        like = SongLike(user_id=user.id, song_id=song_id)
        db.add(like)
        song.like_count += 1
        liked = True

    db.add(song)
    db.commit()
    db.refresh(song)

    return {"song_id": song.id, "liked": liked, "like_count": song.like_count}


@router.patch("/{song_id}/visibility", response_model=SongPublic)
def update_song_visibility(
    song_id: UUID,
    payload: SongVisibilityUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SongPublic:
    """Update the visibility (public/private) of a song."""
    song = db.get(Song, song_id)
    if not song or song.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")

    song.is_public = payload.is_public

    db.add(song)
    db.commit()
    db.refresh(song)

    return SongPublic.model_validate(song, from_attributes=True)


@router.delete("/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_song(
    song_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    song = db.get(Song, song_id)
    if not song or song.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")

    # Let the database handle ON DELETE CASCADE for playlist_songs via the FK.
    # Explicitly remove likes in one statement so rows are cleaned up before deleting the song.
    db.exec(delete(SongLike).where(SongLike.song_id == song_id))

    db.delete(song)
    db.commit()


