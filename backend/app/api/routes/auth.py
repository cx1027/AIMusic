from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import RefreshRequest, TokenPair, User, UserCreate, UserLogin, UserPublic

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/register", response_model=UserPublic)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> UserPublic:
    try:
        normalized_email = payload.email.lower().strip()
        normalized_username = payload.username.strip()
        logger.info(f"Registration attempt for email: {normalized_email}, username: {normalized_username}")
        
        # Check for duplicate email
        sql_query = text("SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(:email)) LIMIT 1")
        result = db.execute(sql_query, {"email": normalized_email})
        row = result.fetchone()
        if row:
            # Get user by ID from the raw SQL result
            user_id = row[0]
            existing = db.get(User, user_id)
            logger.warning(f"User already exists with email: {normalized_email}, user_id: {user_id}")
            if existing:
                logger.warning(f"Registration rejected: Email {normalized_email} already registered")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        
        # Check for duplicate username
        sql_query = text("SELECT id FROM users WHERE TRIM(username) = TRIM(:username) LIMIT 1")
        result = db.execute(sql_query, {"username": normalized_username})
        row = result.fetchone()
        if row:
            logger.warning(f"Registration rejected: Username {normalized_username} already taken")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
        
        user = User(
            email=normalized_email,
            username=normalized_username,
            password_hash=hash_password(payload.password),
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
            logger.info(f"User registered successfully: {user.id}, email: {user.email}")
            return UserPublic.model_validate(user, from_attributes=True)
        except IntegrityError as e:
            db.rollback()
            logger.warning(f"Database integrity error during registration for {normalized_email}: {str(e)}")
            # Check if it's a unique constraint violation on email
            error_str = str(e).lower()
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
                detail="Registration failed due to database constraint violation"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Registration failed for email {payload.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", response_model=TokenPair)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenPair:
    try:
        if not payload.email or not payload.password:
            logger.warning("Login attempt with empty email or password")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email and password are required"
            )
        
        normalized_email = payload.email.lower().strip()
        logger.info(f"Login attempt for email: {normalized_email}")
        
        # Use raw SQL query directly
        sql_query = text("SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(:email)) LIMIT 1")
        result = db.execute(sql_query, {"email": normalized_email})
        row = result.fetchone()
        if row:
            # Get user by ID from the raw SQL result
            user_id = row[0]
            user = db.get(User, user_id)
            logger.info(f"User found: {user_id}")
        else:
            user = None
            logger.warning(f"User not found for email: {normalized_email}")
        
        if not user:
            logger.warning(f"Login failed: User not found for email {normalized_email}")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        
        if not verify_password(payload.password, user.password_hash):
            logger.warning(f"Login failed: Invalid password for email {normalized_email}")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        
        logger.info(f"Login successful for user: {user.id}, email: {user.email}")
        return TokenPair(
            access_token=create_access_token(subject=str(user.id)),
            refresh_token=create_refresh_token(subject=str(user.id)),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Login error for email {payload.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed due to server error"
        )


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest) -> TokenPair:
    try:
        decoded = decode_token(payload.refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    sub = decoded.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    return TokenPair(
        access_token=create_access_token(subject=str(sub)),
        refresh_token=create_refresh_token(subject=str(sub)),
    )


