from __future__ import annotations

from functools import lru_cache

import redis
import redis.asyncio as redis_async

from app.core.config import get_settings


@lru_cache
def _redis_client() -> redis.Redis:
    settings = get_settings()
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)

def get_redis() -> redis.Redis:
    return _redis_client()

@lru_cache
def _redis_async_client() -> redis_async.Redis:
    settings = get_settings()
    return redis_async.Redis.from_url(settings.redis_url, decode_responses=True)

def get_redis_async() -> redis_async.Redis:
    return _redis_async_client()


def check_redis() -> bool:
    try:
        return bool(get_redis().ping())
    except Exception:
        return False


