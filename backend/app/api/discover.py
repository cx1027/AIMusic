from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlmodel import Session, select

from app.api.deps import get_current_user_optional, get_db
from app.models.song import Song
from app.models.song_like import SongLike
from app.models.user import User

router = APIRouter()


def _base_public_song_query() -> select:
    return select(Song).where(Song.is_public.is_(True))


def _rows_to_payload(
    rows: list[tuple[Song, User]],
    liked_song_ids: set[UUID],
) -> list[dict]:
    out: list[dict] = []
    for song, user in rows:
        out.append(
            {
                "id": str(song.id),
                "user_id": str(user.id),
                "username": user.username,
                "title": song.title,
                "prompt": song.prompt,
                "lyrics": song.lyrics,
                "audio_url": song.audio_url,
                "cover_image_url": song.cover_image_url,
                "duration": song.duration,
                "genre": song.genre,
                "bpm": song.bpm,
                "is_public": song.is_public,
                "play_count": song.play_count,
                "like_count": song.like_count,
                "created_at": song.created_at.isoformat(),
                "liked_by_me": song.id in liked_song_ids,
            }
        )
    return out


def _liked_ids_for_user(db: Session, user: Optional[User], song_ids: list[UUID]) -> set[UUID]:
    if not user or not song_ids:
        return set()
    likes = db.exec(
        select(SongLike.song_id).where(
            SongLike.user_id == user.id,
            SongLike.song_id.in_(song_ids),
        )
    ).all()
    return set(likes)


@router.get("")
def discover_feed(
    genre: Optional[str] = Query(default=None, description="Optional genre filter for the genre section"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
) -> dict:
    """
    Public discover feed combining:
    - trending: by like_count then play_count
    - latest: newest public songs
    - genre_songs: optional bucket filtered by `genre`
    """
    # Trending
    trending_stmt = (
        select(Song, User)
        .join(User, User.id == Song.user_id)
        .where(Song.is_public.is_(True))
        .order_by(desc(Song.like_count), desc(Song.play_count), desc(Song.created_at))
        .limit(limit)
    )
    trending_rows = db.exec(trending_stmt).all()

    # Latest
    latest_stmt = (
        select(Song, User)
        .join(User, User.id == Song.user_id)
        .where(Song.is_public.is_(True))
        .order_by(desc(Song.created_at))
        .limit(limit)
    )
    latest_rows = db.exec(latest_stmt).all()

    # Optional genre section
    genre_rows: list[tuple[Song, User]] = []
    if genre:
        genre_stmt = (
            select(Song, User)
            .join(User, User.id == Song.user_id)
            .where(Song.is_public.is_(True), Song.genre == genre)
            .order_by(desc(Song.created_at))
            .limit(limit)
        )
        genre_rows = db.exec(genre_stmt).all()

    all_songs = [row[0] for row in trending_rows + latest_rows + genre_rows]
    liked_ids = _liked_ids_for_user(db, user, [s.id for s in all_songs])

    return {
        "trending": _rows_to_payload(trending_rows, liked_ids),
        "latest": _rows_to_payload(latest_rows, liked_ids),
        "genre_songs": _rows_to_payload(genre_rows, liked_ids) if genre else [],
    }


@router.get("/trending")
def trending(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
) -> list[dict]:
    stmt = (
        select(Song, User)
        .join(User, User.id == Song.user_id)
        .where(Song.is_public.is_(True))
        .order_by(desc(Song.like_count), desc(Song.play_count), desc(Song.created_at))
        .limit(limit)
    )
    rows = db.exec(stmt).all()
    liked_ids = _liked_ids_for_user(db, user, [s.id for s, _ in rows])
    return _rows_to_payload(rows, liked_ids)


@router.get("/latest")
def latest(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
) -> list[dict]:
    stmt = (
        select(Song, User)
        .join(User, User.id == Song.user_id)
        .where(Song.is_public.is_(True))
        .order_by(desc(Song.created_at))
        .limit(limit)
    )
    rows = db.exec(stmt).all()
    liked_ids = _liked_ids_for_user(db, user, [s.id for s, _ in rows])
    return _rows_to_payload(rows, liked_ids)


@router.get("/genres")
def by_genre(
    genre: str = Query(..., description="Genre name to filter by"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
) -> list[dict]:
    stmt = (
        select(Song, User)
        .join(User, User.id == Song.user_id)
        .where(Song.is_public.is_(True), Song.genre == genre)
        .order_by(desc(Song.created_at))
        .limit(limit)
    )
    rows = db.exec(stmt).all()
    liked_ids = _liked_ids_for_user(db, user, [s.id for s, _ in rows])
    return _rows_to_payload(rows, liked_ids)


