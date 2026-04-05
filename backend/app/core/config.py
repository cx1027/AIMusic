from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore")

    app_name: str = "AI Music"
    env: str = "dev"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173"

    jwt_secret: str = "change_me"
    jwt_alg: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    database_url: str = "postgresql+psycopg://aimusic:aimusic@localhost:5432/aimusic"
    redis_url: str = "redis://localhost:6379/0"

    storage_backend: str = "local"  # local | s3
    local_storage_dir: str = ".data"

    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "auto"
    s3_bucket: str = ""

    # Music generation backend selection
    # - celery: POST /api/generate (SSE) -> Celery worker (or BackgroundTasks if FLUXSCHNELL=RUNPOD)
    # - runpod: POST /api/music/generate + polling -> RunPod Serverless
    # - replicate: POST /api/music/generate + polling -> ACE-Step on Replicate (BackgroundTasks, no RunPod)
    music_generation_backend: str = "celery"  # celery | runpod | replicate

    # RunPod Serverless (https://api.runpod.ai/)
    runpod_api_key: str = ""
    runpod_endpoint_id: str = ""
    runpod_api_base_url: str = "https://api.runpod.ai/v2"
    runpod_request_timeout_seconds: int = 30

    # WeChat Official Account / JS-SDK
    wechat_app_id: str = ""
    wechat_app_secret: str = ""

    # ACE-Step 1.5 (local inference)
    ace_step_model_dir: str = "models/ace-step-1.5"
    ace_step_device: str = "mps"  # mps (Mac), cuda, cpu

    # ACE-Step via Replicate API (https://replicate.com/fishaudio/ace-step-1.5)
    replicate_api_token: str = ""

    # FLUX.1 Schnell image generation
    flux_schnell_provider: str = Field(
        default="runpod",
        validation_alias="FLUXSCHNELL",
        description="huggingface | runpod - set via FLUXSCHNELL env var"
    )
    flux_model_dir: str = "models/flux_schnell"  # Path to local Flux Schnell checkpoints
    flux_device: str = "mps"  # mps (Mac), cuda, cpu
    huggingface_token: str = ""  # Hugging Face token for accessing gated models (FLUX.1-schnell) - set via HUGGINGFACE_TOKEN env var
    flux_runpod_endpoint_id: str = ""  # RunPod endpoint ID for FLUX.1 Schnell (e.g., vgsdku5vpadklr) - set via FLUX_RUNPOD_ENDPOINT_ID env var

    # Vercel deployment URL for the Next.js share app
    share_app_url: str = ""

    @field_validator("flux_schnell_provider", mode="before")
    @classmethod
    def normalize_flux_provider(cls, v: str) -> str:
        """Normalize FLUXSCHNELL env var value to lowercase."""
        if isinstance(v, str):
            return v.lower()
        return v

    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


