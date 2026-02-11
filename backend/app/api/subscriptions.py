from fastapi import APIRouter

router = APIRouter()


@router.get("")
def subscription_status() -> dict:
    return {"enabled": False}


