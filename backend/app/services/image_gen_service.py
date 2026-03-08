from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from io import BytesIO
from typing import Callable, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class ImageGenResult:
    image_bytes: bytes


ProgressCb = Callable[[int, str], None]


class FluxNotInstalledError(Exception):
    """Raised when FLUX.1 Schnell dependencies are not available."""


def _generate_via_runpod(
    *, prompt: str, title: str | None = None, progress_cb: Optional[ProgressCb] = None
) -> ImageGenResult:
    """
    Generate cover image using FLUX.1 Schnell via RunPod serverless endpoint.
    
    The image is generated in Cloudflare R2 and we download it from the returned URL.
    
    This function is synchronous and does NOT require Celery. It uses httpx.Client
    to make HTTP requests to RunPod's serverless API and polls for completion.
    Can be called from any Python context (FastAPI routes, Celery tasks, etc.).
    """
    settings = get_settings()
    
    # Get RunPod endpoint ID
    endpoint_id = (
        settings.flux_runpod_endpoint_id
        or os.getenv('FLUX_RUNPOD_ENDPOINT_ID')
    )
    if not endpoint_id:
        raise FluxNotInstalledError(
            "RunPod endpoint ID is required for cover image generation.\n\n"
            "To fix this:\n"
            "1. Set FLUXSCHNELL=RUNPOD environment variable\n"
            "2. Set FLUX_RUNPOD_ENDPOINT_ID environment variable\n"
            "   OR set flux_runpod_endpoint_id in your .env file\n"
            "3. Get your endpoint ID from RunPod console: Serverless -> your endpoint -> endpoint id"
        )
    
    # Get RunPod API key
    runpod_api_key = settings.runpod_api_key or os.getenv('RUNPOD_API_KEY')
    if not runpod_api_key:
        raise FluxNotInstalledError(
            "RunPod API key is required for cover image generation.\n\n"
            "To fix this:\n"
            "1. Set RUNPOD_API_KEY environment variable\n"
            "   OR set runpod_api_key in your .env file\n"
            "2. Get your API key from RunPod console: Settings -> API Keys"
        )
    
    # Enhance prompt for album cover style
    enhanced_prompt = f"Album cover art, {prompt}"
    if title:
        enhanced_prompt = f"Album cover art for '{title}', {prompt}, professional music artwork, vibrant colors, artistic design"
    else:
        enhanced_prompt = f"Album cover art, {prompt}, professional music artwork, vibrant colors, artistic design"
    
    logger.info(f"[image_gen_service] Generating image via RunPod: prompt='{enhanced_prompt[:100]}...'")
    logger.info(f"[image_gen_service] RunPod endpoint_id: {endpoint_id}")
    logger.info(f"[image_gen_service] RunPod API key: {runpod_api_key[:20] + '...' if runpod_api_key else '(not set)'}")
    
    if progress_cb:
        progress_cb(10, "Submitting job to RunPod...")
    
    # Submit job to RunPod
    api_base_url = settings.runpod_api_base_url or "https://api.runpod.ai/v2"
    submit_url = f"{api_base_url.rstrip('/')}/{endpoint_id}/run"
    submit_payload = {"input": {"prompt": enhanced_prompt}}
    
    logger.info(f"[image_gen_service] RunPod submit URL: {submit_url}")
    print(f"[image_gen_service] RunPod submit URL: {submit_url}", flush=True)
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {runpod_api_key}",
    }
    
    try:
        with httpx.Client(timeout=float(settings.runpod_request_timeout_seconds or 30)) as client:
            # Submit job
            resp = client.post(submit_url, json=submit_payload, headers=headers)
            resp.raise_for_status()
            submit_data = resp.json()
    except httpx.HTTPError as e:
        raise FluxNotInstalledError(f"RunPod submit failed: {e}") from e
    except Exception as e:
        raise FluxNotInstalledError(f"RunPod submit failed: {type(e).__name__}: {e}") from e
    
    job_id = submit_data.get("id")
    if not job_id:
        raise FluxNotInstalledError(f"RunPod submit returned no job id: {submit_data}")
    
    logger.info(f"[image_gen_service] RunPod job submitted: {job_id}")
    
    if progress_cb:
        progress_cb(20, "Waiting for image generation...")
    
    # Poll for completion
    status_url = f"{api_base_url.rstrip('/')}/{endpoint_id}/status/{job_id}"
    max_attempts = 120  # Maximum polling attempts (10 minutes at 5s interval)
    poll_interval = 5  # Seconds between polls
    
    for attempt in range(max_attempts):
        try:
            with httpx.Client(timeout=float(settings.runpod_request_timeout_seconds or 30)) as client:
                resp = client.get(status_url, headers={"Authorization": f"Bearer {runpod_api_key}"})
                resp.raise_for_status()
                status_data = resp.json()
        except httpx.HTTPError as e:
            logger.warning(f"[image_gen_service] RunPod status check failed (attempt {attempt + 1}): {e}")
            if attempt < max_attempts - 1:
                time.sleep(poll_interval)
                continue
            raise FluxNotInstalledError(f"RunPod status check failed: {e}") from e
        
        status = str(status_data.get("status", "")).upper()
        
        if status == "COMPLETED":
            # Extract image URL from output
            output = status_data.get("output", {})
            if not isinstance(output, dict):
                raise FluxNotInstalledError(f"RunPod output is not a dict: {output}")
            
            image_url = output.get("image_url")
            if not image_url:
                raise FluxNotInstalledError(f"RunPod output missing image_url: {output}")
            
            # Normalize URL: remove duplicate protocol prefixes (e.g., "https://https://")
            image_url = str(image_url).strip()
            # Remove duplicate protocol prefixes
            while image_url.startswith("https://https://"):
                image_url = image_url[8:]  # Remove first "https://"
            while image_url.startswith("http://http://"):
                image_url = image_url[7:]  # Remove first "http://"
            # Ensure URL has a protocol (default to https://)
            if not image_url.startswith(("http://", "https://")):
                image_url = "https://" + image_url
            
            logger.info(f"[image_gen_service] RunPod job completed, downloading image from: {image_url}")
            
            if progress_cb:
                progress_cb(80, "Downloading generated image...")
            
            # Download image from R2 URL
            try:
                with httpx.Client(timeout=60.0) as client:
                    img_resp = client.get(image_url)
                    img_resp.raise_for_status()
                    image_bytes = img_resp.content
            except httpx.HTTPError as e:
                raise FluxNotInstalledError(f"Failed to download image from {image_url}: {e}") from e
            
            logger.info(f"[image_gen_service] Cover image downloaded successfully ({len(image_bytes)} bytes)")
            
            if progress_cb:
                progress_cb(100, "Image generation complete")
            
            return ImageGenResult(image_bytes=image_bytes)
        
        elif status in ("FAILED", "CANCELLED", "TIMED_OUT"):
            error_msg = status_data.get("error", f"Job {status.lower()}")
            raise FluxNotInstalledError(f"RunPod job {status.lower()}: {error_msg}")
        
        # Status is IN_QUEUE or IN_PROGRESS, continue polling
        if progress_cb and attempt % 4 == 0:  # Update progress every 4 attempts (20 seconds)
            progress_pct = min(20 + int((attempt / max_attempts) * 60), 75)
            progress_cb(progress_pct, f"Generating image... (status: {status})")
        
        time.sleep(poll_interval)
    
    raise FluxNotInstalledError(f"RunPod job timed out after {max_attempts * poll_interval} seconds")


def _generate_via_huggingface(
    *, prompt: str, title: str | None = None, progress_cb: Optional[ProgressCb] = None
) -> ImageGenResult:
    """
    Generate cover image using FLUX.1 Schnell via Hugging Face Inference API.
    
    Creates an album cover-style image based on the song prompt and title.
    """
    print(f"[image_gen_service] Attempting to import huggingface_hub...", flush=True)
    from huggingface_hub import InferenceClient
    from PIL import Image
    print(f"[image_gen_service] Successfully imported huggingface_hub", flush=True)
    
    logger.info(f"[image_gen_service] Generating cover image via Hugging Face API: prompt='{prompt[:50]}...'")
    
    if progress_cb:
        progress_cb(10, "Initializing FLUX.1 Schnell API client...")
    
    # Get settings for Hugging Face token
    settings = get_settings()
    
    # Get Hugging Face token (required for API access)
    hf_token = (
        getattr(settings, 'huggingface_token', None) 
        or os.getenv('HUGGINGFACE_HUB_TOKEN') 
        or os.getenv('HF_TOKEN')
    )
    
    if not hf_token:
        # Try to get from huggingface_hub if logged in via CLI
        try:
            from huggingface_hub import HfFolder
            hf_token = HfFolder.get_token()
        except:
            pass
    
    if not hf_token:
        error_msg = (
            "Hugging Face token is required for cover image generation.\n\n"
            "To fix this:\n"
            "1. Accept the model license at: https://huggingface.co/black-forest-labs/FLUX.1-schnell\n"
            "2. Get your token from: https://huggingface.co/settings/tokens\n"
            "3. Set one of these environment variables:\n"
            "   - HUGGINGFACE_HUB_TOKEN (recommended)\n"
            "   - HF_TOKEN\n"
            "   - Or set huggingface_token in your .env file"
        )
        logger.error(f"[image_gen_service] {error_msg}")
        raise FluxNotInstalledError(error_msg)
    
    # Initialize the Inference API client
    model_id = "black-forest-labs/FLUX.1-schnell"
    logger.info(f"[image_gen_service] Initializing Inference API client for: {model_id}")
    client = InferenceClient(token=hf_token)
    
    if progress_cb:
        progress_cb(30, "Generating cover image...")
    
    # Enhance prompt for album cover style
    enhanced_prompt = f"Album cover art, {prompt}"
    if title:
        enhanced_prompt = f"Album cover art for '{title}', {prompt}, professional music artwork, vibrant colors, artistic design"
    else:
        enhanced_prompt = f"Album cover art, {prompt}, professional music artwork, vibrant colors, artistic design"
    
    logger.info(f"[image_gen_service] Generating image with prompt: '{enhanced_prompt[:100]}...'")
    
    # Generate image using Hugging Face Inference API
    # FLUX.1 Schnell is optimized for 4 steps
    image = client.text_to_image(
        enhanced_prompt,
        model=model_id,
        num_inference_steps=4,
        guidance_scale=3.5,
    )
    
    if progress_cb:
        progress_cb(80, "Processing image...")
    
    # Convert PIL Image to bytes (PNG format)
    img_buffer = BytesIO()
    image.save(img_buffer, format="PNG")
    image_bytes = img_buffer.getvalue()
    
    logger.info(f"[image_gen_service] Cover image generated successfully ({len(image_bytes)} bytes)")
    
    return ImageGenResult(image_bytes=image_bytes)


def generate_cover_image(
    *, prompt: str, title: str | None = None, progress_cb: Optional[ProgressCb] = None
) -> ImageGenResult:
    """
    Generate a cover image using FLUX.1 Schnell.
    
    Supports two providers:
    - huggingface: Uses Hugging Face Inference API (default)
    - runpod: Uses RunPod serverless endpoint (NO Celery required - synchronous HTTP calls)
    
    Provider is selected via FLUXSCHNELL environment variable or flux_schnell_provider config.
    
    Creates an album cover-style image based on the song prompt and title.
    
    Note: When using RunPod provider, this function does NOT require Celery.
    It makes synchronous HTTP requests and can be called from any Python context.
    """
    print(f"[image_gen_service] generate_cover_image called: prompt='{prompt[:50]}...'", flush=True)
    
    try:
        # Determine provider
        settings = get_settings()
        # Get provider from env var or config, defaulting to 'huggingface'
        env_provider = os.getenv('FLUXSCHNELL', '').strip().upper()
        config_provider = (settings.flux_schnell_provider or '').strip().lower()
        
        # Debug logging
        logger.info(f"[image_gen_service] Provider selection - env_provider='{env_provider}', config_provider='{config_provider}'")
        print(f"[image_gen_service] Provider selection - env_provider='{env_provider}', config_provider='{config_provider}'", flush=True)
        print(f"[image_gen_service] FLUXSCHNELL env var: '{os.getenv('FLUXSCHNELL', '(not set)')}'", flush=True)
        print(f"[image_gen_service] settings.flux_schnell_provider: '{settings.flux_schnell_provider}'", flush=True)
        print(f"[image_gen_service] settings.flux_runpod_endpoint_id: '{settings.flux_runpod_endpoint_id}'", flush=True)
        print(f"[image_gen_service] settings.runpod_api_key: '{settings.runpod_api_key[:20] + '...' if settings.runpod_api_key else '(not set)'}'", flush=True)
        
        if env_provider:
            provider = env_provider
        elif config_provider:
            provider = config_provider.upper()
        else:
            provider = 'HUGGINGFACE'
        
        logger.info(f"[image_gen_service] Using FLUX.1 Schnell provider: {provider}")
        print(f"[image_gen_service] Selected provider: {provider}", flush=True)
        
        if provider == "RUNPOD":
            return _generate_via_runpod(prompt=prompt, title=title, progress_cb=progress_cb)
        else:
            return _generate_via_huggingface(prompt=prompt, title=title, progress_cb=progress_cb)
        
    except FluxNotInstalledError:
        # Re-raise FluxNotInstalledError as-is
        raise
    except ImportError as e:
        print(f"[image_gen_service] ImportError: Dependencies not available: {e}", flush=True)
        import traceback
        print(f"[image_gen_service] ImportError traceback: {traceback.format_exc()}", flush=True)
        logger.warning(f"[image_gen_service] Dependencies not available: {e}")
        raise FluxNotInstalledError(f"Required dependencies not installed: {e}") from e
    except Exception as e:
        print(f"[image_gen_service] Exception: Error generating cover image: {type(e).__name__}: {e}", flush=True)
        import traceback
        print(f"[image_gen_service] Exception traceback: {traceback.format_exc()}", flush=True)
        logger.error(f"[image_gen_service] Error generating cover image: {e}", exc_info=True)
        # Convert unexpected exceptions to FluxNotInstalledError so they're handled gracefully
        raise FluxNotInstalledError(f"Failed to generate cover image: {type(e).__name__}: {e}") from e
