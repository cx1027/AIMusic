from __future__ import annotations

from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_current_user_optional, get_db
from app.models.user import User, UserPublic, UserPublicProfile, UserUpdate
from app.models.user_follow import UserFollow
from app.services.storage_service import get_storage

router = APIRouter()


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(user, from_attributes=True)


@router.patch("/me", response_model=UserPublic)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserPublic:
    """Update current user's email, username, and/or details."""
    if payload.email is not None:
        normalized_email = payload.email.lower().strip()
        # Check if email is already taken by another user
        sql_query = text("SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(:email)) AND id != :user_id LIMIT 1")
        result = db.execute(sql_query, {"email": normalized_email, "user_id": user.id})
        row = result.fetchone()
        if row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        user.email = normalized_email
    
    if payload.username is not None:
        normalized_username = payload.username.strip()
        # Check if username is already taken by another user
        sql_query = text("SELECT id FROM users WHERE TRIM(username) = TRIM(:username) AND id != :user_id LIMIT 1")
        result = db.execute(sql_query, {"username": normalized_username, "user_id": user.id})
        row = result.fetchone()
        if row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
        user.username = normalized_username
    
    if payload.details is not None:
        user.details = payload.details.strip() if payload.details else ""
    
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
        return UserPublic.model_validate(user, from_attributes=True)
    except IntegrityError as e:
        db.rollback()
        error_str = str(e).lower()
        # Check if it's a unique constraint violation on email
        if "email" in error_str and "unique" in error_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        # Check if it's a unique constraint violation on username
        if "username" in error_str and "unique" in error_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Update failed due to database constraint violation"
        )


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Upload or update the current user's avatar image."""
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image files are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    suffix = Path(file.filename).suffix or ".jpg"
    stored = get_storage().store_bytes(content=content, suffix=suffix, content_type=file.content_type or "image/jpeg")

    user.avatar_url = stored.url
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"avatar_url": user.avatar_url}


@router.post("/me/background")
async def upload_background(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Upload or update the current user's profile background image."""
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image files are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    suffix = Path(file.filename).suffix or ".jpg"
    stored = get_storage().store_bytes(content=content, suffix=suffix, content_type=file.content_type or "image/jpeg")

    user.background_url = stored.url
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"background_url": user.background_url}


@router.post("/{user_id}/follow")
def follow_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> dict:
    """Follow another user."""
    if user_id == current.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot follow yourself")

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = db.exec(
        select(UserFollow).where(
            UserFollow.follower_id == current.id,
            UserFollow.following_id == user_id,
        )
    ).first()
    if existing:
        return {"user_id": str(user_id), "following": True}

    follow = UserFollow(follower_id=current.id, following_id=user_id)
    db.add(follow)
    db.commit()

    return {"user_id": str(user_id), "following": True}


@router.delete("/{user_id}/follow")
def unfollow_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> dict:
    """Unfollow a user."""
    existing = db.exec(
        select(UserFollow).where(
            UserFollow.follower_id == current.id,
            UserFollow.following_id == user_id,
        )
    ).first()
    if not existing:
        return {"user_id": str(user_id), "following": False}

    db.delete(existing)
    db.commit()

    return {"user_id": str(user_id), "following": False}


@router.get("/username/{username}", response_model=UserPublicProfile)
def get_user_by_username(
    username: str,
    db: Session = Depends(get_db),
    current: User | None = Depends(get_current_user_optional),
) -> UserPublicProfile:
    """Get a user's public profile by username, enriched with follow counts."""
    user = db.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Follower/following counts
    followers_count_result = db.execute(
        text("SELECT COUNT(*) FROM user_follows WHERE following_id = :uid"),
        {"uid": user.id},
    )
    followers_count = int(followers_count_result.scalar() or 0)

    following_count_result = db.execute(
        text("SELECT COUNT(*) FROM user_follows WHERE follower_id = :uid"),
        {"uid": user.id},
    )
    following_count = int(following_count_result.scalar() or 0)

    # Whether the current user is following this profile
    is_following: bool | None = None
    is_me = False
    if current:
        is_me = current.id == user.id
        if not is_me:
            rel = db.exec(
                select(UserFollow).where(
                    UserFollow.follower_id == current.id,
                    UserFollow.following_id == user.id,
                )
            ).first()
            is_following = bool(rel)

    return UserPublicProfile(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        background_url=user.background_url,
        details=user.details,
        subscription_tier=user.subscription_tier,
        created_at=user.created_at,
        followers_count=followers_count,
        following_count=following_count,
        is_following=is_following,
        is_me=is_me,
    )


