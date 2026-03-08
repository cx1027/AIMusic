#!/usr/bin/env python3
"""
Simple configuration check for cover image generation.
Checks environment variables and configuration without requiring .env file access.
"""

import os
import sys

def check_config():
    """Check cover image generation configuration."""
    print("=" * 60)
    print("Cover Image Generation Configuration Check")
    print("=" * 60)
    print()
    
    # Check provider
    flux_provider = os.getenv('FLUXSCHNELL', '').strip().upper()
    if not flux_provider:
        flux_provider = 'HUGGINGFACE'  # Default
    
    print(f"Provider: {flux_provider}")
    print()
    
    issues = []
    
    if flux_provider == "RUNPOD":
        print("Checking RunPod configuration...")
        
        # Check endpoint ID
        endpoint_id = os.getenv('FLUX_RUNPOD_ENDPOINT_ID', '').strip()
        if endpoint_id:
            print(f"✓ FLUX_RUNPOD_ENDPOINT_ID: {endpoint_id[:10]}...")
        else:
            print("✗ FLUX_RUNPOD_ENDPOINT_ID: Not set")
            issues.append("FLUX_RUNPOD_ENDPOINT_ID")
        
        # Check API key
        runpod_api_key = os.getenv('RUNPOD_API_KEY', '').strip()
        if runpod_api_key:
            print(f"✓ RUNPOD_API_KEY: {runpod_api_key[:10]}...")
        else:
            print("✗ RUNPOD_API_KEY: Not set")
            issues.append("RUNPOD_API_KEY")
        
    else:
        print("Checking Hugging Face configuration...")
        
        # Check token (multiple possible names)
        hf_token = (
            os.getenv('HUGGINGFACE_HUB_TOKEN', '').strip() or
            os.getenv('HUGGINGFACE_TOKEN', '').strip() or
            os.getenv('HF_TOKEN', '').strip()
        )
        
        if hf_token:
            print(f"✓ Hugging Face token: {hf_token[:10]}...")
        else:
            print("✗ Hugging Face token: Not set")
            print("  Checked: HUGGINGFACE_HUB_TOKEN, HUGGINGFACE_TOKEN, HF_TOKEN")
            issues.append("HUGGINGFACE_HUB_TOKEN")
    
    print()
    
    if issues:
        print("⚠ Configuration Issues Found:")
        for issue in issues:
            print(f"  - {issue} is not set")
        print()
        print("To fix:")
        if flux_provider == "RUNPOD":
            print("  1. Set FLUXSCHNELL=RUNPOD")
            print("  2. Set FLUX_RUNPOD_ENDPOINT_ID=your_endpoint_id")
            print("  3. Set RUNPOD_API_KEY=your_api_key")
        else:
            print("  1. Accept model license: https://huggingface.co/black-forest-labs/FLUX.1-schnell")
            print("  2. Get token: https://huggingface.co/settings/tokens")
            print("  3. Set HUGGINGFACE_HUB_TOKEN=your_token")
            print("     Or add to .env file: HUGGINGFACE_HUB_TOKEN=your_token")
        return False
    else:
        print("✓ Configuration looks good!")
        print()
        print("Note: This only checks environment variables.")
        print("If using .env file, make sure variables are loaded correctly.")
        return True


if __name__ == "__main__":
    success = check_config()
    sys.exit(0 if success else 1)
