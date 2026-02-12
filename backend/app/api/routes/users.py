from __future__ import annotations

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_current_user_optional, get_db
from app.models.user import User, UserPublic, UserPublicProfile, UserUpdate
from app.models.user_follow import UserFollow

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
    """Update current user's email and/or username."""
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
        user.username = payload.username.strip()
    
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserPublic.model_validate(user, from_attributes=True)


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
) -> UserPublicProfile:
    """Get a user's public profile by username."""
    user = db.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserPublicProfile.model_validate(user, from_attributes=True)


