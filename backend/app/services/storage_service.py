from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from uuid import uuid4

import boto3

from app.core.config import get_settings


@dataclass
class StoredFile:
    key: str
    url: str


class StorageService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def store_bytes(self, *, content: bytes, suffix: str, content_type: str = "application/octet-stream") -> StoredFile:
        backend = (self.settings.storage_backend or "local").lower()
        if backend == "s3":
            return self._store_s3(content=content, suffix=suffix, content_type=content_type)
        return self._store_local(content=content, suffix=suffix)

    def _store_local(self, *, content: bytes, suffix: str) -> StoredFile:
        base = Path(self.settings.local_storage_dir)
        base.mkdir(parents=True, exist_ok=True)
        key = f"{uuid4().hex}{suffix}"
        p = base / key
        p.write_bytes(content)
        # Served via backend route: /api/files/{key}
        return StoredFile(key=key, url=f"{self.settings.api_prefix}/files/{key}")

    def _store_s3(self, *, content: bytes, suffix: str, content_type: str) -> StoredFile:
        s = self.settings
        if not (s.s3_bucket and s.s3_access_key_id and s.s3_secret_access_key):
            raise RuntimeError("S3 backend selected but missing S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY")
        key = f"audio/{uuid4().hex}{suffix}"
        client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint_url or None,
            aws_access_key_id=s.s3_access_key_id,
            aws_secret_access_key=s.s3_secret_access_key,
            region_name=s.s3_region or None,
        )
        client.put_object(Bucket=s.s3_bucket, Key=key, Body=content, ContentType=content_type)

        # If you use R2/S3 private buckets, swap to signed URLs here.
        public_base = os.getenv("S3_PUBLIC_BASE_URL", "").rstrip("/")
        if public_base:
            url = f"{public_base}/{key}"
        else:
            # Fallback (may not be publicly accessible depending on provider)
            url = f"{s.s3_endpoint_url.rstrip('/')}/{s.s3_bucket}/{key}" if s.s3_endpoint_url else f"s3://{s.s3_bucket}/{key}"
        return StoredFile(key=key, url=url)


_storage: Optional[StorageService] = None


def get_storage() -> StorageService:
    global _storage
    if _storage is None:
        _storage = StorageService()
    return _storage


def get_signed_url(key: str, *, ttl_seconds: int = 600) -> str:
    """
    Return a short-lived signed URL for S3/R2 objects.
    Local backend should directly serve files via /api/files/{key}.
    """
    s = get_settings()
    backend = (s.storage_backend or "local").lower()
    if backend != "s3":
        raise RuntimeError("Signed URLs only supported for S3 backend")

    if not (s.s3_bucket and s.s3_access_key_id and s.s3_secret_access_key):
        raise RuntimeError("Missing S3 configuration for signed URLs")

    client = boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url or None,
        aws_access_key_id=s.s3_access_key_id,
        aws_secret_access_key=s.s3_secret_access_key,
        region_name=s.s3_region or None,
    )
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": s.s3_bucket, "Key": key},
        ExpiresIn=ttl_seconds,
    )


