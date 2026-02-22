from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse, Response

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.models.file_object import FileObject
from app.models.user import User
from app.services.storage_service import get_storage, get_signed_url
from sqlmodel import Session

from app.api.deps import get_db

router = APIRouter()


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict:
    # NOTE: `user` is currently unused; we still require auth to prevent anonymous uploads.
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    suffix = Path(file.filename).suffix or ""
    stored = get_storage().store_bytes(content=content, suffix=suffix, content_type=file.content_type or "application/octet-stream")

    # Persist as a private draft file; do not expose raw storage URL here.
    db: Session = get_db()
    fo = FileObject(
        user_id=user.id,
        key=stored.key,
        content_type=file.content_type or "application/octet-stream",
        original_filename=file.filename,
        status="draft",
    )
    db.add(fo)
    db.commit()
    db.refresh(fo)

    return {
        "id": str(fo.id),
        "key": fo.key,
        "status": fo.status,
        "content_type": fo.content_type,
        "original_filename": fo.original_filename,
    }


@router.get("/{key}")
async def get_file(key: str, request: Request):
    """
    Backwards-compatible local-file serving (used only for local backend
    without signed URLs). For S3/R2, issue a short-lived signed URL redirect.
    """
    settings = get_settings()
    backend = (settings.storage_backend or "local").lower()

    if backend == "local":
        base = Path(settings.local_storage_dir)
        p = (base / key).resolve()
        if not str(p).startswith(str(base.resolve())):
            raise HTTPException(status_code=400, detail="Invalid path")
        if not p.exists():
            raise HTTPException(status_code=404, detail="Not found")
        
        # Determine media type from file extension
        ext = p.suffix.lower()
        media_types = {
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".flac": "audio/flac",
            ".ogg": "audio/ogg",
            ".m4a": "audio/mp4",
        }
        media_type = media_types.get(ext, "application/octet-stream")
        
        return FileResponse(p, media_type=media_type)

    # S3/R2: redirect to signed URL
    try:
        url = get_signed_url(key)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return RedirectResponse(url)


