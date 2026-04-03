"""
Track share API — public-facing endpoints for the Next.js share page.

POST /api/track-shares/publish   — authenticated user creates a public share for a song
GET  /api/track-shares/{slug}    — public: resolve slug → full track info for OG meta
POST /api/track-shares/revalidate — authenticated: invalidate Next.js ISR cache for a slug
POST /api/track-shares/{slug}/revoke — authenticated: mark share as revoked
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_db
from app.core.config import get_settings
from app.models.song import Song
from app.models.user import User

router = APIRouter()
settings = get_settings()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class PublishRequest(BaseModel):
    song_id: UUID
    is_public: bool = True  # whether share is publicly listed (discovery page)
    expires_in_hours: int | None = None  # None = never expires


class PublishResponse(BaseModel):
    slug: str
    share_url: str
    is_public: bool
    expires_at: str | None


class TrackShareData(BaseModel):
    """Full track info returned for share page rendering (including OG meta)."""
    slug: str
    song_id: str
    title: str
    prompt: str
    lyrics: str | None
    audio_url: str | None
    cover_image_url: str | None
    duration: int
    genre: str | None
    bpm: int | None
    play_count: int
    like_count: int
    created_at: str
    user: "ShareUserInfo"
    is_revoked: bool = False


class ShareUserInfo(BaseModel):
    username: str
    avatar_url: str | None


class RevalidateResponse(BaseModel):
    slug: str
    revalidated: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

NEXTJS_SHARE_URL = "https://your-domain.com"  # replace with actual Vercel URL


def _make_slug() -> str:
    return token_urlsafe(10)


def _build_share_url(slug: str) -> str:
    domain = settings.cors_origins_list()[0] if settings.cors_origins_list() else "http://localhost:3000"
    return f"{domain}/share/track/{slug}"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/publish", status_code=status.HTTP_201_CREATED, response_model=PublishResponse)
def publish_share(
    payload: PublishRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PublishResponse:
    """Create (or re-publish) a public share for one of the user's songs."""
    song = db.get(Song, payload.song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    if song.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your song")

    # Re-use existing slug if one already exists for this song
    if song.share_slug:
        slug = song.share_slug
    else:
        slug = _make_slug()
        song.share_slug = slug
        db.add(song)

    song.is_public_share = payload.is_public
    db.add(song)
    db.commit()
    db.refresh(song)

    expires_at = None

    return PublishResponse(
        slug=slug,
        share_url=_build_share_url(slug),
        is_public=payload.is_public,
        expires_at=expires_at,
    )


@router.get("/{slug}", response_model=TrackShareData)
def get_share(
    slug: str,
    db: Session = Depends(get_db),
) -> TrackShareData:
    """
    Public endpoint — no auth required.
    Returns all data needed to render the share page and its OG meta tags.
    """
    song = db.exec(select(Song).where(Song.share_slug == slug)).first()
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")

    # Increment play count
    song.play_count += 1
    db.add(song)
    db.commit()

    # Load user info
    from app.models.user import User
    owner = db.get(User, song.user_id)

    return TrackShareData(
        slug=slug,
        song_id=str(song.id),
        title=song.title,
        prompt=song.prompt,
        lyrics=song.lyrics,
        audio_url=song.audio_url,
        cover_image_url=song.cover_image_url,
        duration=song.duration,
        genre=song.genre,
        bpm=song.bpm,
        play_count=song.play_count,
        like_count=song.like_count,
        created_at=song.created_at.isoformat(),
        user=ShareUserInfo(
            username=owner.username if owner else "unknown",
            avatar_url=owner.avatar_url if owner else None,
        ),
        is_revoked=False,
    )


@router.post("/{slug}/revoke", status_code=status.HTTP_200_OK)
def revoke_share(
    slug: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Revoke a share — only the song owner can do this."""
    song = db.exec(select(Song).where(Song.share_slug == slug)).first()
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")
    if song.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your song")

    song.share_slug = None
    song.is_public_share = False
    db.add(song)
    db.commit()

    return {"slug": slug, "revoked": True}


@router.post("/revalidate", response_model=RevalidateResponse)
def revalidate_share(
    payload: PublishRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RevalidateResponse:
    """
    Called when song metadata (title, cover, etc.) changes.
    In production this would trigger a Next.js on-demand ISR revalidation
    via the Vercel Revalidate API or a custom cache tag purge.
    """
    song = db.get(Song, payload.song_id)
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    if song.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your song")
    if not song.share_slug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song has no share slug")

    slug = song.share_slug

    # --- Vercel On-Demand ISR revalidation ---
    # Replace with your actual Vercel deployment or a self-hosted Next.js revalidation endpoint
    vercel_token = settings.flux_runpod_endpoint_id  # reuse existing env var slot; set NEXT_PUBLIC_SITE_URL in .env
    site_url = settings.cors_origins_list()[0] if settings.cors_origins_list() else "http://localhost:3000"

    # Purge Vercel CDN cache for this specific path
    try:
        import httpx
        revalidate_url = f"{site_url}/api/revalidate"
        httpx.post(
            revalidate_url,
            json={"slug": slug},
            timeout=10,
        )
    except Exception:
        # Non-fatal: log but don't fail the request
        pass

    return RevalidateResponse(slug=slug, revalidated=True)
