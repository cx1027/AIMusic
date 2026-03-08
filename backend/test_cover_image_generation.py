#!/usr/bin/env python3
"""
Test script to diagnose cover image generation issues.

This script will:
1. Check environment variables
2. Test cover image generation directly
3. Show detailed error messages if any
"""

import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

print("=" * 80)
print("Cover Image Generation Diagnostic Test")
print("=" * 80)
print()

# 1. Check environment variables
print("1. Checking environment variables...")
print("-" * 80)
flux_schnell = os.getenv("FLUXSCHNELL", "").strip().upper()
flux_runpod_endpoint_id = os.getenv("FLUX_RUNPOD_ENDPOINT_ID", "")
runpod_api_key = os.getenv("RUNPOD_API_KEY", "")
huggingface_token = os.getenv("HUGGINGFACE_HUB_TOKEN", "")

print(f"  FLUXSCHNELL: {flux_schnell if flux_schnell else '(not set)'}")
print(f"  FLUX_RUNPOD_ENDPOINT_ID: {flux_runpod_endpoint_id[:20] + '...' if flux_runpod_endpoint_id else '(not set)'}")
print(f"  RUNPOD_API_KEY: {runpod_api_key[:20] + '...' if runpod_api_key else '(not set)'}")
print(f"  HUGGINGFACE_HUB_TOKEN: {huggingface_token[:20] + '...' if huggingface_token else '(not set)'}")
print()

# 2. Check .env file
print("2. Checking .env file...")
print("-" * 80)
env_file = backend_dir / ".env"
if env_file.exists():
    print(f"  .env file exists: {env_file}")
    with open(env_file) as f:
        lines = f.readlines()
        for line in lines:
            line = line.strip()
            if line and not line.startswith("#"):
                if "FLUXSCHNELL" in line or "FLUX_RUNPOD" in line or "RUNPOD_API_KEY" in line:
                    # Mask sensitive values
                    if "=" in line:
                        key, value = line.split("=", 1)
                        if "KEY" in key or "TOKEN" in key:
                            print(f"  {key}={value[:20] + '...' if len(value) > 20 else value}")
                        else:
                            print(f"  {line}")
else:
    print(f"  .env file not found: {env_file}")
print()

# 3. Try importing the service
print("3. Testing imports...")
print("-" * 80)
try:
    from app.services.image_gen_service import generate_cover_image, FluxNotInstalledError
    print("  ✅ Successfully imported generate_cover_image")
except ImportError as e:
    print(f"  ❌ Failed to import: {e}")
    sys.exit(1)
except Exception as e:
    print(f"  ❌ Unexpected error importing: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
print()

# 4. Test cover image generation
print("4. Testing cover image generation...")
print("-" * 80)
print("  Calling generate_cover_image with test prompt...")
print()

try:
    result = generate_cover_image(
        prompt="test prompt for diagnostic",
        title="Test Song",
        progress_cb=lambda p, m: print(f"    Progress: {p}% - {m}", flush=True)
    )
    print()
    print(f"  ✅ Cover image generated successfully!")
    print(f"  Image size: {len(result.image_bytes)} bytes")
    print(f"  Image type: PNG")
except FluxNotInstalledError as e:
    print()
    print(f"  ❌ FLUX.1 Schnell not available:")
    print(f"  {str(e)}")
    print()
    print("  Possible solutions:")
    if flux_schnell == "RUNPOD":
        if not flux_runpod_endpoint_id:
            print("    - Set FLUX_RUNPOD_ENDPOINT_ID environment variable")
        if not runpod_api_key:
            print("    - Set RUNPOD_API_KEY environment variable")
    else:
        if not huggingface_token:
            print("    - Set HUGGINGFACE_HUB_TOKEN environment variable")
        print("    - Or set FLUXSCHNELL=RUNPOD to use RunPod")
    sys.exit(1)
except Exception as e:
    print()
    print(f"  ❌ Unexpected error:")
    print(f"  Type: {type(e).__name__}")
    print(f"  Message: {str(e)}")
    import traceback
    print()
    print("  Full traceback:")
    traceback.print_exc()
    sys.exit(1)

print()
print("=" * 80)
print("✅ All tests passed! Cover image generation is working.")
print("=" * 80)
