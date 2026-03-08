#!/usr/bin/env python3
"""
验证 RunPod 配置的脚本
通过分析代码和检查环境变量来验证配置是否正确
"""

import os
import sys
from pathlib import Path

def check_env_file():
    """检查 .env 文件是否存在"""
    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        return None, "未找到 .env 文件"
    
    try:
        # 尝试读取 .env 文件（不显示敏感信息）
        content = env_file.read_text(encoding='utf-8')
        lines = content.split('\n')
        
        config_found = {}
        for line in lines:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                
                # 检查 RunPod 相关配置
                if 'RUNPOD' in key.upper() or 'FLUX' in key.upper():
                    if 'KEY' in key.upper() or 'TOKEN' in key.upper():
                        config_found[key] = '***已设置***' if value else '未设置'
                    else:
                        config_found[key] = value[:20] + '...' if value and len(value) > 20 else (value if value else '未设置')
        
        return config_found, None
    except Exception as e:
        return None, f"读取 .env 文件时出错: {e}"


def check_code_references():
    """检查代码中对 RunPod 配置的引用"""
    backend_dir = Path(__file__).parent
    
    # 需要检查的配置项
    required_configs = {
        '音乐生成': {
            'runpod_endpoint_id': 'RUNPOD_ENDPOINT_ID',
            'runpod_api_key': 'RUNPOD_API_KEY',
            'music_generation_backend': 'music_generation_backend',
        },
        '封面图片生成': {
            'flux_runpod_endpoint_id': 'FLUX_RUNPOD_ENDPOINT_ID',
            'runpod_api_key': 'RUNPOD_API_KEY',  # 共享同一个 API key
            'flux_schnell_provider': 'FLUXSCHNELL',
        }
    }
    
    return required_configs


def main():
    print("=" * 70)
    print("RunPod 配置验证报告")
    print("=" * 70)
    print()
    
    # 1. 检查 .env 文件
    print("【1. 检查 .env 文件】")
    print("-" * 70)
    env_configs, error = check_env_file()
    
    if error:
        print(f"⚠️  {error}")
    elif env_configs:
        print("✓ 找到以下 RunPod/FLUX 相关配置:")
        for key, value in sorted(env_configs.items()):
            print(f"  {key}: {value}")
    else:
        print("⚠️  未在 .env 文件中找到 RunPod/FLUX 相关配置")
    print()
    
    # 2. 检查环境变量
    print("【2. 检查环境变量】")
    print("-" * 70)
    env_vars = {
        'RUNPOD_API_KEY': os.getenv('RUNPOD_API_KEY'),
        'RUNPOD_ENDPOINT_ID': os.getenv('RUNPOD_ENDPOINT_ID'),
        'FLUX_RUNPOD_ENDPOINT_ID': os.getenv('FLUX_RUNPOD_ENDPOINT_ID'),
        'FLUXSCHNELL': os.getenv('FLUXSCHNELL'),
    }
    
    found_env_vars = False
    for key, value in env_vars.items():
        if value:
            if 'KEY' in key:
                print(f"✓ {key}: {'*' * 10}... (已设置)")
            else:
                print(f"✓ {key}: {value[:20]}...")
            found_env_vars = True
    
    if not found_env_vars:
        print("⚠️  未找到 RunPod 相关的环境变量")
        print("   (配置可能只在 .env 文件中)")
    print()
    
    # 3. 配置要求说明
    print("【3. 配置要求说明】")
    print("-" * 70)
    
    required_configs = check_code_references()
    
    print("音乐生成需要以下配置:")
    print("  1. music_generation_backend = 'runpod' (在 .env 中)")
    print("  2. runpod_endpoint_id = 'your_endpoint_id' (在 .env 中)")
    print("     或环境变量: RUNPOD_ENDPOINT_ID")
    print("  3. runpod_api_key = 'your_api_key' (在 .env 中)")
    print("     或环境变量: RUNPOD_API_KEY")
    print()
    
    print("封面图片生成需要以下配置:")
    print("  1. FLUXSCHNELL = 'RUNPOD' (环境变量或 .env)")
    print("  2. flux_runpod_endpoint_id = 'your_endpoint_id' (在 .env 中)")
    print("     或环境变量: FLUX_RUNPOD_ENDPOINT_ID")
    print("  3. runpod_api_key = 'your_api_key' (在 .env 中)")
    print("     或环境变量: RUNPOD_API_KEY (与音乐生成共享)")
    print()
    
    # 4. 验证配置完整性
    print("【4. 配置完整性检查】")
    print("-" * 70)
    
    issues = []
    
    # 检查音乐生成配置
    music_endpoint = env_vars.get('RUNPOD_ENDPOINT_ID') or (env_configs.get('runpod_endpoint_id') if env_configs else None)
    music_api_key = env_vars.get('RUNPOD_API_KEY') or (env_configs.get('runpod_api_key') if env_configs else None)
    
    if not music_endpoint:
        issues.append("音乐生成缺少 RUNPOD_ENDPOINT_ID")
    else:
        print(f"✓ 音乐生成 Endpoint ID: {music_endpoint[:20]}...")
    
    if not music_api_key:
        issues.append("音乐生成缺少 RUNPOD_API_KEY")
    else:
        print(f"✓ RunPod API Key: 已设置")
    
    # 检查封面图片配置
    flux_provider = (env_vars.get('FLUXSCHNELL') or '').strip().upper()
    if env_configs:
        flux_provider = flux_provider or (env_configs.get('FLUXSCHNELL') or '').strip().upper() or (env_configs.get('flux_schnell_provider') or '').strip().upper()
    
    if not flux_provider:
        flux_provider = 'HUGGINGFACE'  # 默认值
    
    print(f"  FLUX 提供商: {flux_provider}")
    
    if flux_provider == 'RUNPOD':
        image_endpoint = env_vars.get('FLUX_RUNPOD_ENDPOINT_ID') or (env_configs.get('flux_runpod_endpoint_id') if env_configs else None)
        image_api_key = env_vars.get('RUNPOD_API_KEY') or (env_configs.get('runpod_api_key') if env_configs else None)
        
        if not image_endpoint:
            issues.append("封面图片生成缺少 FLUX_RUNPOD_ENDPOINT_ID")
        else:
            print(f"✓ 封面图片 Endpoint ID: {image_endpoint[:20]}...")
        
        if not image_api_key:
            issues.append("封面图片生成缺少 RUNPOD_API_KEY")
    else:
        print("  (封面图片使用 Hugging Face，不需要 RunPod 配置)")
    
    print()
    
    # 5. 总结
    print("【5. 总结】")
    print("-" * 70)
    
    if issues:
        print("❌ 发现配置问题:")
        for issue in issues:
            print(f"  - {issue}")
        print()
        print("修复建议:")
        print("  1. 确保 .env 文件包含所有必需的配置项")
        print("  2. 或者设置相应的环境变量")
        print("  3. 重启后端服务以加载新配置")
        print()
        print("参考配置示例 (backend/env.example):")
        print("  music_generation_backend=runpod")
        print("  runpod_endpoint_id=your_music_endpoint_id")
        print("  runpod_api_key=your_api_key")
        print("  FLUXSCHNELL=RUNPOD")
        print("  flux_runpod_endpoint_id=your_image_endpoint_id")
        return False
    else:
        print("✓ 配置看起来完整！")
        print()
        print("注意:")
        print("  - 如果配置在 .env 文件中，请确保后端服务已重启")
        print("  - 如果使用环境变量，请确保它们在后端服务启动时可用")
        print("  - 音乐生成和封面图片可以使用不同的 Endpoint ID")
        print("  - 它们共享同一个 RUNPOD_API_KEY")
        return True


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 验证过程中出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
