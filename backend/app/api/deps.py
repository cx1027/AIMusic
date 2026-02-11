from __future__ import annotations

from typing import Annotated, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import decode_token
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


def get_db():
    with get_session() as s:
        yield s


def get_current_user(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    token = None
    if creds is not None and creds.credentials:
        token = creds.credentials
    else:
        # NOTE: browsers' EventSource cannot set Authorization headers.
        # We allow `?token=...` for SSE endpoints.
        token = request.query_params.get("token") or request.query_params.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    try:
        user_id = UUID(sub)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = db.exec(select(User).where(User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_current_user_optional(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> Optional[User]:
    """
    Same as `get_current_user` but returns None instead of raising when
    credentials are missing or invalid. Useful for public endpoints that
    want to personalize responses when a user is logged in.
    """
    token: Optional[str] = None
    if creds is not None and creds.credentials:
        token = creds.credentials
    else:
        token = request.query_params.get("token") or request.query_params.get("access_token")

    if not token:
        return None

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        sub = payload.get("sub")
        if not sub:
            return None
        user_id = UUID(sub)
    except Exception:
        return None

    user = db.exec(select(User).where(User.id == user_id)).first()
    return user


