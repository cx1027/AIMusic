from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    email: str = Field(index=True, unique=True)
    username: str = Field(index=True)
    password_hash: str

    subscription_tier: str = Field(default="free", index=True)
    credits_balance: int = Field(default=100)

    avatar_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCreate(SQLModel):
    email: str
    username: str
    password: str


class UserLogin(SQLModel):
    email: str
    password: str


class TokenPair(SQLModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(SQLModel):
    refresh_token: str


class UserUpdate(SQLModel):
    email: Optional[str] = None
    username: Optional[str] = None


class UserPublic(SQLModel):
    id: UUID
    email: str
    username: str
    avatar_url: Optional[str] = None
    subscription_tier: str
    credits_balance: int
    created_at: datetime


class UserPublicProfile(SQLModel):
    """Public profile without sensitive information like email and credits."""
    id: UUID
    username: str
    avatar_url: Optional[str] = None
    subscription_tier: str
    created_at: datetime


