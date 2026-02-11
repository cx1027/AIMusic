from __future__ import annotations

import hashlib
import secrets
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.cache import get_redis
from app.core.config import get_settings

router = APIRouter()


async def _get_wechat_access_token(app_id: str, app_secret: str) -> str:
    redis = get_redis()
    cached = redis.get("wechat:access_token")
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={"grant_type": "client_credential", "appid": app_id, "secret": app_secret},
        )
        data = resp.json()
    if "access_token" not in data:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"WeChat token error: {data.get('errmsg') or 'unknown error'}",
        )
    token = data["access_token"]
    expires_in = int(data.get("expires_in", 7200))
    redis.setex("wechat:access_token", max(expires_in - 60, 60), token)
    return token


async def _get_wechat_jsapi_ticket(access_token: str) -> str:
    redis = get_redis()
    cached = redis.get("wechat:jsapi_ticket")
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            "https://api.weixin.qq.com/cgi-bin/ticket/getticket",
            params={"access_token": access_token, "type": "jsapi"},
        )
        data = resp.json()
    if data.get("errcode") != 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"WeChat ticket error: {data.get('errmsg') or 'unknown error'}",
        )
    ticket = data["ticket"]
    expires_in = int(data.get("expires_in", 7200))
    redis.setex("wechat:jsapi_ticket", max(expires_in - 60, 60), ticket)
    return ticket


@router.get("/jsconfig")
async def wechat_js_config(
    url: str = Query(..., description="Current page URL (without hash) used for JS-SDK signature"),
) -> dict:
    """
    Generate WeChat JS-SDK config for a given page URL.

    Frontend usage:
      - call this endpoint with the current page URL
      - then call wx.config with the returned fields.
    """
    settings = get_settings()
    app_id: Optional[str] = getattr(settings, "wechat_app_id", None)
    app_secret: Optional[str] = getattr(settings, "wechat_app_secret", None)

    if not app_id or not app_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WeChat config not set on server",
        )

    access_token = await _get_wechat_access_token(app_id, app_secret)
    ticket = await _get_wechat_jsapi_ticket(access_token)

    nonce_str = secrets.token_hex(8)
    timestamp = int(time.time())

    # Signature string must use lower-case keys and be sorted by key name
    raw = f"jsapi_ticket={ticket}&noncestr={nonce_str}&timestamp={timestamp}&url={url}"
    signature = hashlib.sha1(raw.encode("utf-8")).hexdigest()

    return {
        "appId": app_id,
        "timestamp": timestamp,
        "nonceStr": nonce_str,
        "signature": signature,
    }



