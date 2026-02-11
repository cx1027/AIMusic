from __future__ import annotations

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_db
from app.models.user import User, UserPublic
from app.models.user_follow import UserFollow

router = APIRouter()


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
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


