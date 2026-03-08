#!/usr/bin/env python3
"""
调试脚本：检查 RunPod FLUX 配置和请求流程
"""
import os
import sys
from pathlib import Path

# 添加 backend 目录到路径
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

print("=" * 80)
print("RunPod FLUX 配置调试")
print("=" * 80)

# 1. 检查环境变量
print("\n1. 环境变量检查:")
print(f"   FLUXSCHNELL: {os.getenv('FLUXSCHNELL', '(未设置)')}")
print(f"   FLUX_RUNPOD_ENDPOINT_ID: {os.getenv('FLUX_RUNPOD_ENDPOINT_ID', '(未设置)')}")
print(f"   RUNPOD_API_KEY: {os.getenv('RUNPOD_API_KEY', '(未设置)')[:20] + '...' if os.getenv('RUNPOD_API_KEY') else '(未设置)'}")

# 2. 检查 .env 文件
print("\n2. .env 文件内容:")
env_file = backend_dir / '.env'
if env_file.exists():
    try:
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and ('FLUX' in line.upper() or 'RUNPOD' in line.upper()):
                    if 'KEY' in line.upper():
                        key, value = line.split('=', 1)
                        print(f"   {key.strip()}={value.strip()[:20]}...")
                    else:
                        print(f"   {line}")
    except Exception as e:
        print(f"   ❌ 读取错误: {e}")
else:
    print(f"   ⚠️  .env 文件不存在: {env_file}")

# 3. 检查配置对象
print("\n3. 配置对象检查:")
try:
    from app.core.config import get_settings
    settings = get_settings()
    
    print(f"   settings.flux_schnell_provider: {settings.flux_schnell_provider}")
    print(f"   settings.flux_runpod_endpoint_id: {settings.flux_runpod_endpoint_id}")
    print(f"   settings.runpod_api_key: {settings.runpod_api_key[:20] + '...' if settings.runpod_api_key else '(未设置)'}")
    
    # 检查 provider 选择逻辑
    env_provider = os.getenv('FLUXSCHNELL', '').strip().upper()
    config_provider = (settings.flux_schnell_provider or '').strip().lower()
    
    print(f"\n   Provider 选择逻辑:")
    print(f"   - env_provider (FLUXSCHNELL): '{env_provider}'")
    print(f"   - config_provider (settings.flux_schnell_provider): '{config_provider}'")
    
    if env_provider:
        provider = env_provider
    elif config_provider:
        provider = config_provider.upper()
    else:
        provider = 'HUGGINGFACE'
    
    print(f"   - 最终选择的 provider: '{provider}'")
    
    if provider != "RUNPOD":
        print(f"\n   ⚠️  问题：provider 不是 'RUNPOD'，而是 '{provider}'")
        print(f"   这意味着代码会使用 HuggingFace 而不是 RunPod")
    
except Exception as e:
    print(f"   ❌ 配置加载失败: {e}")
    import traceback
    traceback.print_exc()

# 4. 检查 image_gen_service 逻辑
print("\n4. image_gen_service 逻辑检查:")
try:
    from app.services.image_gen_service import generate_cover_image
    
    # 模拟检查（不实际生成图片）
    settings = get_settings()
    env_provider = os.getenv('FLUXSCHNELL', '').strip().upper()
    config_provider = (settings.flux_schnell_provider or '').strip().lower()
    
    if env_provider:
        provider = env_provider
    elif config_provider:
        provider = config_provider.upper()
    else:
        provider = 'HUGGINGFACE'
    
    print(f"   generate_cover_image 会使用的 provider: '{provider}'")
    
    if provider == "RUNPOD":
        endpoint_id = settings.flux_runpod_endpoint_id or os.getenv('FLUX_RUNPOD_ENDPOINT_ID')
        runpod_api_key = settings.runpod_api_key or os.getenv('RUNPOD_API_KEY')
        
        if not endpoint_id:
            print(f"   ❌ FLUX_RUNPOD_ENDPOINT_ID 未设置")
        else:
            print(f"   ✅ FLUX_RUNPOD_ENDPOINT_ID: {endpoint_id}")
        
        if not runpod_api_key:
            print(f"   ❌ RUNPOD_API_KEY 未设置")
        else:
            print(f"   ✅ RUNPOD_API_KEY: {runpod_api_key[:20]}...")
        
        if endpoint_id and runpod_api_key:
            api_base_url = settings.runpod_api_base_url or "https://api.runpod.ai/v2"
            submit_url = f"{api_base_url.rstrip('/')}/{endpoint_id}/run"
            print(f"\n   ✅ 请求 URL 应该是: {submit_url}")
        else:
            print(f"\n   ❌ 无法构建请求 URL：缺少必要的配置")
    else:
        print(f"   ⚠️  provider 不是 RUNPOD，不会发送请求到 RunPod")
        
except Exception as e:
    print(f"   ❌ 检查失败: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 80)
print("调试完成")
print("=" * 80)
