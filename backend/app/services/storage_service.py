from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

import boto3


@dataclass
class StoredFile:
    key: str
    url: str


@dataclass
class AudioStorageResult:
    bytes: bytes
    r2_url: str
    key: str


def _get_r2_config() -> tuple[str, str, str, str, str]:
    """
    Read R2 credentials from environment variables.

    Raises RuntimeError with a clear message if any required variable is missing.
    """
    r2_endpoint = os.environ.get("R2_ENDPOINT", "").strip()
    r2_access_key = os.environ.get("R2_ACCESS_KEY", "").strip()
    r2_secret_key = os.environ.get("R2_SECRET_KEY", "").strip()
    r2_bucket_name = os.environ.get("R2_BUCKET_NAME", "").strip()
    r2_public_url = os.environ.get("R2_PUBLIC_URL", "").strip()

    missing = []
    if not r2_endpoint:
        missing.append("R2_ENDPOINT")
    if not r2_access_key:
        missing.append("R2_ACCESS_KEY")
    if not r2_secret_key:
        missing.append("R2_SECRET_KEY")
    if not r2_bucket_name:
        missing.append("R2_BUCKET_NAME")

    if missing:
        raise RuntimeError(
            f"R2 upload failed: missing required environment variables: {', '.join(missing)}. "
            f"Ensure R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, and R2_BUCKET_NAME are set in backend/.env."
        )

    return r2_endpoint, r2_access_key, r2_secret_key, r2_bucket_name, r2_public_url


def _upload_bytes_to_r2(
    content: bytes,
    key: str,
    content_type: str,
) -> str:
    """
    Upload bytes to R2 using the S3-compatible API.
    Returns the public URL of the uploaded file.
    Raises RuntimeError on any R2 error.
    """
    r2_endpoint, r2_access_key, r2_secret_key, r2_bucket_name, r2_public_url = _get_r2_config()

    client = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=r2_access_key,
        aws_secret_access_key=r2_secret_key,
        region_name="auto",
    )
    try:
        client.put_object(
            Bucket=r2_bucket_name,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
    except Exception as e:
        raise RuntimeError(f"R2 upload failed for key '{key}': {type(e).__name__}: {e}") from e

    if r2_public_url:
        return f"{r2_public_url}/{key}"
    return f"{r2_bucket_name}.r2.dev/{key}"


class StorageService:
    def store_bytes(
        self,
        *,
        content: bytes,
        suffix: str,
        content_type: str = "application/octet-stream",
        folder: str = "audio",
    ) -> StoredFile:
        """
        Upload arbitrary bytes to R2.

        Args:
            content:       Raw bytes to upload.
            suffix:        File suffix (e.g. ".mp3", ".png").
            content_type:  MIME type for the Content-Type header.
            folder:        Top-level folder key in R2 (default "audio").

        Returns:
            StoredFile with the R2 public URL.

        Raises:
            RuntimeError if R2 credentials are missing or upload fails.
        """
        key = f"{folder}/{uuid4().hex}{suffix}"
        url = _upload_bytes_to_r2(content=content, key=key, content_type=content_type)
        return StoredFile(key=key, url=url)

    def upload_to_r2(
        self,
        content: bytes,
        suffix: str,
        content_type: str = "audio/mpeg",
        *,
        folder_date: Optional[date] = None,
    ) -> AudioStorageResult:
        """
        Upload audio bytes to R2 with a date-based folder path.

        Key format: songs/{YYYY-MM-DD}/{uuid}{suffix}

        Args:
            content:       Raw audio bytes.
            suffix:        File suffix (e.g. ".mp3").
            content_type:  MIME type for the Content-Type header.
            folder_date:   Date used for the folder path; defaults to today.

        Returns:
            AudioStorageResult with bytes, r2_url, and key.

        Raises:
            RuntimeError if R2 credentials are missing or upload fails.
        """
        if folder_date is None:
            folder_date = datetime.now().date()

        date_str = folder_date.strftime("%Y-%m-%d")
        key = f"songs/{date_str}/{uuid4().hex}{suffix}"
        url = _upload_bytes_to_r2(content=content, key=key, content_type=content_type)
        return AudioStorageResult(bytes=content, r2_url=url, key=key)


_storage: Optional[StorageService] = None


def get_storage() -> StorageService:
    global _storage
    if _storage is None:
        _storage = StorageService()
    return _storage


def get_signed_url(key: str, *, ttl_seconds: int = 600) -> str:
    """
    Return a short-lived signed URL for an R2 object.

    Raises RuntimeError if R2 credentials are missing or signing fails.
    """
    r2_endpoint, r2_access_key, r2_secret_key, r2_bucket_name, _ = _get_r2_config()

    client = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=r2_access_key,
        aws_secret_access_key=r2_secret_key,
        region_name="auto",
    )
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": r2_bucket_name, "Key": key},
            ExpiresIn=ttl_seconds,
        )
    except Exception as e:
        raise RuntimeError(f"R2 signed URL generation failed for key '{key}': {type(e).__name__}: {e}") from e
