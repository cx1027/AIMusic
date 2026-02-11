from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.share_service import ShareService

router = APIRouter()


@router.post("/publish", status_code=status.HTTP_201_CREATED)
def publish_share(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    file_object_id = payload.get("file_object_id")
    expires_in_hours = payload.get("expires_in_hours")
    if not file_object_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing file_object_id")

    try:
        service = ShareService(db)
        share = service.publish(owner=user, file_object_id=file_object_id, expires_in_hours=expires_in_hours)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    return {"slug": share.slug, "expires_at": share.expires_at.isoformat() if share.expires_at else None}


@router.post("/revoke", status_code=status.HTTP_200_OK)
def revoke_share(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    slug = payload.get("slug")
    if not slug:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing slug")

    try:
        service = ShareService(db)
        share = service.revoke(owner=user, slug=slug)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    return {"slug": share.slug, "revoked_at": share.revoked_at.isoformat() if share.revoked_at else None}


@router.get("/{slug}")
def resolve_share(
    slug: str,
    db: Session = Depends(get_db),
) -> dict:
    service = ShareService(db)
    try:
        return service.resolve(slug)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


