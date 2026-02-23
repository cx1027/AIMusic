from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from io import BytesIO
from typing import Callable, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class ImageGenResult:
    image_bytes: bytes


ProgressCb = Callable[[int, str], None]


class FluxNotInstalledError(Exception):
    """Raised when FLUX.1 Schnell dependencies are not available."""


def generate_cover_image(
    *, prompt: str, title: str | None = None, progress_cb: Optional[ProgressCb] = None
) -> ImageGenResult:
    """
    Generate a cover image using FLUX.1 Schnell via Hugging Face Inference API.
    
    Creates an album cover-style image based on the song prompt and title.
    """
    print(f"[image_gen_service] generate_cover_image called: prompt='{prompt[:50]}...'", flush=True)
    try:
        print(f"[image_gen_service] Attempting to import huggingface_hub...", flush=True)
        from huggingface_hub import InferenceClient
        from PIL import Image
        print(f"[image_gen_service] Successfully imported huggingface_hub", flush=True)
        
        logger.info(f"[image_gen_service] Generating cover image via API: prompt='{prompt[:50]}...'")
        
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
                "Hugging Face token is required for API access! Please:\n"
                "1. Accept the model license at: https://huggingface.co/black-forest-labs/FLUX.1-schnell\n"
                "2. Get your token from: https://huggingface.co/settings/tokens\n"
                "3. Set HUGGINGFACE_HUB_TOKEN environment variable\n"
                "   OR set huggingface_token in your .env file"
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
        
    except ImportError as e:
        print(f"[image_gen_service] ImportError: Hugging Face dependencies not available: {e}", flush=True)
        import traceback
        print(f"[image_gen_service] ImportError traceback: {traceback.format_exc()}", flush=True)
        logger.warning(f"[image_gen_service] Hugging Face dependencies not available: {e}")
        raise FluxNotInstalledError("Hugging Face dependencies not installed. Install huggingface_hub and Pillow.") from e
    except Exception as e:
        print(f"[image_gen_service] Exception: Error generating cover image: {type(e).__name__}: {e}", flush=True)
        import traceback
        print(f"[image_gen_service] Exception traceback: {traceback.format_exc()}", flush=True)
        logger.error(f"[image_gen_service] Error generating cover image: {e}", exc_info=True)
        raise
