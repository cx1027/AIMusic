from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse

from app.api.deps import get_current_user
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
    try:
        stored = get_storage().store_bytes(
            content=content, suffix=suffix, content_type=file.content_type or "application/octet-stream"
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

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
async def get_file(key: str):
    """
    Serve R2 files via short-lived signed URL redirect.
    Raises 500 if R2 credentials are missing or signing fails.
    """
    try:
        url = get_signed_url(key)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return RedirectResponse(url)
