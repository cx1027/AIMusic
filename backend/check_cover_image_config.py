#!/usr/bin/env python3
"""
Check cover image generation configuration.

This script verifies that FLUX.1 Schnell is properly configured for cover image generation.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import get_settings
from app.services.image_gen_service import FluxNotInstalledError, generate_cover_image


def check_config():
    """Check cover image generation configuration."""
    print("=" * 60)
    print("Cover Image Generation Configuration Check")
    print("=" * 60)
    print()
    
    settings = get_settings()
    
    # Check provider
    env_provider = os.getenv('FLUXSCHNELL', '').strip().upper()
    config_provider = (settings.flux_schnell_provider or '').strip().lower()
    
    if env_provider:
        provider = env_provider
    elif config_provider:
        provider = config_provider.upper()
    else:
        provider = 'HUGGINGFACE'
    
    print(f"Provider: {provider}")
    print()
    
    if provider == "RUNPOD":
        print("Checking RunPod configuration...")
        
        # Check endpoint ID
        endpoint_id = (
            settings.flux_runpod_endpoint_id
            or os.getenv('FLUX_RUNPOD_ENDPOINT_ID')
        )
        if endpoint_id:
            print(f"✓ FLUX_RUNPOD_ENDPOINT_ID: {endpoint_id[:10]}...")
        else:
            print("✗ FLUX_RUNPOD_ENDPOINT_ID: Not set")
            print("  Set FLUX_RUNPOD_ENDPOINT_ID environment variable")
        
        # Check API key
        runpod_api_key = settings.runpod_api_key or os.getenv('RUNPOD_API_KEY')
        if runpod_api_key:
            print(f"✓ RUNPOD_API_KEY: {runpod_api_key[:10]}...")
        else:
            print("✗ RUNPOD_API_KEY: Not set")
            print("  Set RUNPOD_API_KEY environment variable")
        
        if not endpoint_id or not runpod_api_key:
            print()
            print("RunPod configuration is incomplete!")
            return False
        
    else:
        print("Checking Hugging Face configuration...")
        
        # Check token
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
                if hf_token:
                    print("✓ Hugging Face token: Found via CLI login")
            except:
                pass
        
        if hf_token:
            print(f"✓ Hugging Face token: {hf_token[:10]}...")
        else:
            print("✗ Hugging Face token: Not set")
            print("  Set HUGGINGFACE_HUB_TOKEN environment variable")
            print("  Or set HUGGINGFACE_TOKEN in .env file")
            print("  Get token from: https://huggingface.co/settings/tokens")
            print("  Accept model license at: https://huggingface.co/black-forest-labs/FLUX.1-schnell")
            return False
    
    print()
    print("Configuration looks good!")
    print()
    print("Testing image generation with a simple prompt...")
    
    try:
        result = generate_cover_image(
            prompt="test image",
            title="Test",
            progress_cb=lambda p, m: print(f"  Progress: {p}% - {m}")
        )
        print(f"✓ Success! Generated image size: {len(result.image_bytes)} bytes")
        return True
    except FluxNotInstalledError as e:
        print(f"✗ Error: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {type(e).__name__}: {e}")
        return False


if __name__ == "__main__":
    success = check_config()
    sys.exit(0 if success else 1)
