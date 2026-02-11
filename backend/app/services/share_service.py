from __future__ import annotations

from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from app.core.config import get_settings
from app.models.file_object import FileObject
from app.models.file_share import FileShare
from app.models.user import User
from app.services.storage_service import get_signed_url


class ShareService:
    """Share tokens around `FileObject` with optional expiry & revoke."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()

    def _generate_slug(self) -> str:
        # URL-safe short-ish slug
        return token_urlsafe(10)

    def publish(
        self,
        *,
        owner: User,
        file_object_id: UUID,
        expires_in_hours: Optional[int] = 24 * 7,
    ) -> FileShare:
        fo = self.db.get(FileObject, file_object_id)
        if not fo or fo.user_id != owner.id:
            raise PermissionError("File not found or not owned by user")

        # Mark as published
        fo.status = "published"

        expires_at: Optional[datetime] = None
        if expires_in_hours is not None:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)

        share = FileShare(
            file_object_id=fo.id,
            user_id=owner.id,
            slug=self._generate_slug(),
            expires_at=expires_at,
        )
        self.db.add(share)
        self.db.add(fo)
        self.db.commit()
        self.db.refresh(share)
        return share

    def revoke(self, *, owner: User, slug: str) -> FileShare:
        share = self._get_share(slug)
        if not share or share.user_id != owner.id:
            raise PermissionError("Share not found or not owned by user")
        if share.revoked_at is None:
            share.revoked_at = datetime.now(timezone.utc)
            self.db.add(share)
            self.db.commit()
            self.db.refresh(share)
        return share

    def _get_share(self, slug: str) -> Optional[FileShare]:
        return self.db.exec(select(FileShare).where(FileShare.slug == slug)).first()

    def resolve(self, slug: str) -> dict:
        """Resolve slug -> public playback info (storage URL via redirect/signed URL)."""
        share = self._get_share(slug)
        if not share:
            raise LookupError("Share not found")

        now = datetime.now(timezone.utc)
        if share.revoked_at is not None:
            raise PermissionError("Share has been revoked")
        if share.expires_at and share.expires_at < now:
            raise PermissionError("Share has expired")

        fo = self.db.get(FileObject, share.file_object_id)
        if not fo:
            raise LookupError("File not found")

        # Increment access counter
        share.access_count += 1
        self.db.add(share)
        self.db.commit()

        # Local backend: content_url will be /api/files/{key}
        backend = (self.settings.storage_backend or "local").lower()
        if backend == "local":
            content_url = f"{self.settings.api_prefix}/files/{fo.key}"
        else:
            content_url = get_signed_url(fo.key)

        return {
            "slug": share.slug,
            "file": {
                "id": str(fo.id),
                "key": fo.key,
                "content_type": fo.content_type,
                "original_filename": fo.original_filename,
            },
            "content_url": content_url,
            "expires_at": share.expires_at.isoformat() if share.expires_at else None,
            "revoked_at": share.revoked_at.isoformat() if share.revoked_at else None,
        }


