from fastapi import APIRouter

from . import auth, discover, generate, playlists, shares, songs, subscriptions, users, wechat
from .routes import files

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(songs.router, prefix="/songs", tags=["songs"])
api_router.include_router(generate.router, prefix="/generate", tags=["generate"])
api_router.include_router(playlists.router, prefix="/playlists", tags=["playlists"])
api_router.include_router(shares.router, prefix="/shares", tags=["shares"])
api_router.include_router(discover.router, prefix="/discover", tags=["discover"])
api_router.include_router(subscriptions.router, prefix="/subscriptions", tags=["subscriptions"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(wechat.router, prefix="/wechat", tags=["wechat"])

__all__ = ["api_router"]
