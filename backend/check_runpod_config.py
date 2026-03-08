#!/usr/bin/env python3
"""
检查 RunPod 配置的完整脚本
检查音乐生成和封面图片生成的 RunPod 配置
"""

import os
import sys
from pathlib import Path

# 添加项目路径到 sys.path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

try:
    from app.core.config import get_settings
except ImportError:
    print("警告: 无法导入配置模块，仅检查环境变量")
    get_settings = None


def check_runpod_config():
    """检查 RunPod 配置"""
    print("=" * 70)
    print("RunPod 配置检查")
    print("=" * 70)
    print()
    
    issues = []
    warnings = []
    
    # 1. 检查音乐生成的 RunPod 配置
    print("【1. 音乐生成配置】")
    print("-" * 70)
    
    if get_settings:
        settings = get_settings()
        music_backend = settings.music_generation_backend
        print(f"音乐生成后端: {music_backend}")
        
        if music_backend == "runpod":
            # 检查 runpod_endpoint_id
            music_endpoint_id = settings.runpod_endpoint_id or os.getenv('RUNPOD_ENDPOINT_ID', '')
            if music_endpoint_id:
                print(f"✓ 音乐生成 Endpoint ID: {music_endpoint_id[:15]}...")
            else:
                print("✗ 音乐生成 Endpoint ID: 未设置")
                issues.append("RUNPOD_ENDPOINT_ID (音乐生成)")
            
            # 检查 runpod_api_key
            music_api_key = settings.runpod_api_key or os.getenv('RUNPOD_API_KEY', '')
            if music_api_key:
                print(f"✓ RunPod API Key: {'*' * 10}... (已设置)")
            else:
                print("✗ RunPod API Key: 未设置")
                issues.append("RUNPOD_API_KEY")
            
            # 检查 API Base URL
            api_base_url = settings.runpod_api_base_url or "https://api.runpod.ai/v2"
            print(f"  API Base URL: {api_base_url}")
        else:
            print(f"  当前使用 {music_backend} 后端，不需要 RunPod 配置")
    else:
        # 仅检查环境变量
        music_endpoint_id = os.getenv('RUNPOD_ENDPOINT_ID', '')
        music_api_key = os.getenv('RUNPOD_API_KEY', '')
        
        if music_endpoint_id:
            print(f"✓ RUNPOD_ENDPOINT_ID: {music_endpoint_id[:15]}...")
        else:
            print("✗ RUNPOD_ENDPOINT_ID: 未设置")
            warnings.append("RUNPOD_ENDPOINT_ID (环境变量)")
        
        if music_api_key:
            print(f"✓ RUNPOD_API_KEY: {'*' * 10}... (已设置)")
        else:
            print("✗ RUNPOD_API_KEY: 未设置")
            warnings.append("RUNPOD_API_KEY (环境变量)")
    
    print()
    
    # 2. 检查封面图片生成的 RunPod 配置
    print("【2. 封面图片生成配置】")
    print("-" * 70)
    
    # 检查 FLUXSCHNELL 设置
    flux_provider = os.getenv('FLUXSCHNELL', '').strip().upper()
    if get_settings:
        settings = get_settings()
        if not flux_provider:
            flux_provider = (settings.flux_schnell_provider or 'huggingface').upper()
    
    if not flux_provider:
        flux_provider = 'HUGGINGFACE'  # 默认值
    
    print(f"FLUX 提供商: {flux_provider}")
    
    if flux_provider == "RUNPOD":
        # 检查 flux_runpod_endpoint_id
        if get_settings:
            settings = get_settings()
            image_endpoint_id = settings.flux_runpod_endpoint_id or os.getenv('FLUX_RUNPOD_ENDPOINT_ID', '')
        else:
            image_endpoint_id = os.getenv('FLUX_RUNPOD_ENDPOINT_ID', '')
        
        if image_endpoint_id:
            print(f"✓ 封面图片 Endpoint ID: {image_endpoint_id[:15]}...")
        else:
            print("✗ 封面图片 Endpoint ID: 未设置")
            issues.append("FLUX_RUNPOD_ENDPOINT_ID")
        
        # 检查 runpod_api_key（封面图片也使用相同的 API key）
        if get_settings:
            settings = get_settings()
            image_api_key = settings.runpod_api_key or os.getenv('RUNPOD_API_KEY', '')
        else:
            image_api_key = os.getenv('RUNPOD_API_KEY', '')
        
        if image_api_key:
            print(f"✓ RunPod API Key: {'*' * 10}... (已设置)")
        else:
            print("✗ RunPod API Key: 未设置")
            if "RUNPOD_API_KEY" not in issues:
                issues.append("RUNPOD_API_KEY")
    else:
        print("  当前使用 Hugging Face，不需要 RunPod 配置")
        print("  如需使用 RunPod，请设置: FLUXSCHNELL=RUNPOD")
    
    print()
    
    # 3. 配置总结和建议
    print("【3. 配置总结】")
    print("-" * 70)
    
    if issues:
        print("⚠️  发现配置问题:")
        for issue in issues:
            print(f"  - {issue}")
        print()
        print("修复建议:")
        print()
        
        if "RUNPOD_ENDPOINT_ID" in str(issues):
            print("  音乐生成需要:")
            print("  1. 设置环境变量: RUNPOD_ENDPOINT_ID=your_endpoint_id")
            print("  2. 或在 .env 文件中设置: runpod_endpoint_id=your_endpoint_id")
            print()
        
        if "FLUX_RUNPOD_ENDPOINT_ID" in str(issues):
            print("  封面图片生成需要:")
            print("  1. 设置环境变量: FLUXSCHNELL=RUNPOD")
            print("  2. 设置环境变量: FLUX_RUNPOD_ENDPOINT_ID=your_endpoint_id")
            print("  3. 或在 .env 文件中设置: flux_runpod_endpoint_id=your_endpoint_id")
            print()
        
        if "RUNPOD_API_KEY" in str(issues):
            print("  RunPod API Key 需要:")
            print("  1. 设置环境变量: RUNPOD_API_KEY=your_api_key")
            print("  2. 或在 .env 文件中设置: runpod_api_key=your_api_key")
            print("  3. 获取 API Key: https://www.runpod.io/console/settings/api-keys")
            print()
        
        return False
    else:
        print("✓ RunPod 配置看起来正确！")
        print()
        
        if warnings:
            print("⚠️  警告:")
            for warning in warnings:
                print(f"  - {warning}")
            print("  这些配置可能通过 .env 文件设置，请确保后端服务已加载")
            print()
        
        # 检查配置一致性
        if get_settings:
            settings = get_settings()
            music_backend = settings.music_generation_backend
            
            if music_backend == "runpod" and flux_provider == "RUNPOD":
                music_endpoint = settings.runpod_endpoint_id or os.getenv('RUNPOD_ENDPOINT_ID', '')
                image_endpoint = settings.flux_runpod_endpoint_id or os.getenv('FLUX_RUNPOD_ENDPOINT_ID', '')
                
                if music_endpoint and image_endpoint and music_endpoint != image_endpoint:
                    print("ℹ️  注意: 音乐生成和封面图片使用不同的 Endpoint ID")
                    print(f"  音乐: {music_endpoint[:15]}...")
                    print(f"  封面: {image_endpoint[:15]}...")
                    print("  这是正常的，如果它们是不同的 RunPod 端点")
                    print()
        
        return True


if __name__ == "__main__":
    try:
        success = check_runpod_config()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 检查过程中出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
