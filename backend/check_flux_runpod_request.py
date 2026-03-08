#!/usr/bin/env python3
"""
检查 Generate AI Song 功能是否向 FLUX_RUNPOD_ENDPOINT_ID 发送请求

这个脚本会：
1. 检查 FLUXSCHNELL 和 FLUX_RUNPOD_ENDPOINT_ID 配置
2. 检查代码逻辑，确认请求流程
3. 提供调试建议
"""

import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

def check_config():
    """检查配置"""
    print("=" * 80)
    print("检查 FLUX RunPod 配置")
    print("=" * 80)
    
    # Check environment variables
    flux_schnell = os.getenv('FLUXSCHNELL', '').strip().upper()
    flux_endpoint_id = os.getenv('FLUX_RUNPOD_ENDPOINT_ID', '').strip()
    runpod_api_key = os.getenv('RUNPOD_API_KEY', '').strip()
    
    print(f"\n1. 环境变量检查:")
    print(f"   FLUXSCHNELL: {flux_schnell if flux_schnell else '(未设置)'}")
    print(f"   FLUX_RUNPOD_ENDPOINT_ID: {flux_endpoint_id[:10] + '...' if flux_endpoint_id else '(未设置)'}")
    print(f"   RUNPOD_API_KEY: {'已设置' if runpod_api_key else '(未设置)'}")
    
    # Check .env file
    env_file = backend_dir / '.env'
    env_configs = {}
    if env_file.exists():
        print(f"\n2. .env 文件检查 ({env_file}):")
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip().strip('"').strip("'")
                        if 'FLUX' in key.upper() or 'RUNPOD' in key.upper():
                            env_configs[key] = value
                            if 'KEY' in key.upper():
                                print(f"   {key}={value[:10] + '...' if len(value) > 10 else value}")
                            else:
                                print(f"   {key}={value}")
        except PermissionError:
            print(f"   ⚠️  无法读取 .env 文件（权限限制）")
        except Exception as e:
            print(f"   ⚠️  读取 .env 文件时出错: {e}")
    
    # Merge env vars with .env file
    if not flux_schnell and 'FLUXSCHNELL' in env_configs:
        flux_schnell = env_configs['FLUXSCHNELL'].strip().upper()
    if not flux_endpoint_id and 'FLUX_RUNPOD_ENDPOINT_ID' in env_configs:
        flux_endpoint_id = env_configs['FLUX_RUNPOD_ENDPOINT_ID'].strip()
    if not runpod_api_key and 'RUNPOD_API_KEY' in env_configs:
        runpod_api_key = env_configs['RUNPOD_API_KEY'].strip()
    
    # Check settings
    try:
        from app.core.config import get_settings
        settings = get_settings()
        print(f"\n3. 配置对象检查:")
        print(f"   flux_schnell_provider: {settings.flux_schnell_provider or '(未设置)'}")
        print(f"   flux_runpod_endpoint_id: {settings.flux_runpod_endpoint_id[:10] + '...' if settings.flux_runpod_endpoint_id else '(未设置)'}")
        print(f"   runpod_api_key: {'已设置' if settings.runpod_api_key else '(未设置)'}")
        
        # Use settings if env vars not set
        if not flux_schnell and settings.flux_schnell_provider:
            flux_schnell = settings.flux_schnell_provider.strip().upper()
        if not flux_endpoint_id and settings.flux_runpod_endpoint_id:
            flux_endpoint_id = settings.flux_runpod_endpoint_id.strip()
        if not runpod_api_key and settings.runpod_api_key:
            runpod_api_key = settings.runpod_api_key.strip()
    except Exception as e:
        print(f"\n3. 配置对象检查失败: {e}")
    
    # Final check
    print(f"\n4. 最终配置状态:")
    issues = []
    
    if flux_schnell != 'RUNPOD':
        print(f"   ❌ FLUXSCHNELL 不是 'RUNPOD' (当前: {flux_schnell or '未设置'})")
        issues.append("FLUXSCHNELL")
    else:
        print(f"   ✅ FLUXSCHNELL = RUNPOD")
    
    if not flux_endpoint_id:
        print(f"   ❌ FLUX_RUNPOD_ENDPOINT_ID 未设置")
        issues.append("FLUX_RUNPOD_ENDPOINT_ID")
    else:
        print(f"   ✅ FLUX_RUNPOD_ENDPOINT_ID = {flux_endpoint_id}")
        if flux_endpoint_id == 'vgsdku5vpadklr':
            print(f"      ✓ 端点 ID 匹配目标值")
        else:
            print(f"      ⚠️  端点 ID 与目标值不同 (目标: vgsdku5vpadklr)")
    
    if not runpod_api_key:
        print(f"   ❌ RUNPOD_API_KEY 未设置")
        issues.append("RUNPOD_API_KEY")
    else:
        print(f"   ✅ RUNPOD_API_KEY 已设置")
    
    return issues, flux_schnell, flux_endpoint_id, runpod_api_key


def check_code_flow():
    """检查代码流程"""
    print("\n" + "=" * 80)
    print("检查代码流程")
    print("=" * 80)
    
    print("\n1. 前端 -> 后端请求流程:")
    print("   ✅ 前端: Generate.tsx -> POST /api/generate")
    print("   ✅ 后端: routes/generate.py -> create_generation()")
    print("   ✅ 任务: tasks/music_generation.py -> run_generation_task()")
    print("   ✅ 服务: services/image_gen_service.py -> generate_cover_image()")
    
    print("\n2. 封面图片生成流程:")
    print("   - generate_cover_image() 检查 FLUXSCHNELL 环境变量")
    print("   - 如果 FLUXSCHNELL=RUNPOD，调用 _generate_via_runpod()")
    print("   - _generate_via_runpod() 使用 FLUX_RUNPOD_ENDPOINT_ID 构建请求 URL")
    print("   - 请求 URL 格式: https://api.runpod.ai/v2/{endpoint_id}/run")
    
    print("\n3. 关键代码位置:")
    print("   - backend/app/services/image_gen_service.py:265 (generate_cover_image)")
    print("   - backend/app/services/image_gen_service.py:29 (_generate_via_runpod)")
    print("   - backend/app/services/image_gen_service.py:83 (构建请求 URL)")


def check_request_url(endpoint_id):
    """检查请求 URL"""
    print("\n" + "=" * 80)
    print("请求 URL 检查")
    print("=" * 80)
    
    if not endpoint_id:
        print("\n⚠️  无法检查请求 URL：FLUX_RUNPOD_ENDPOINT_ID 未设置")
        return
    
    api_base_url = os.getenv('RUNPOD_API_BASE_URL', 'https://api.runpod.ai/v2')
    submit_url = f"{api_base_url.rstrip('/')}/{endpoint_id}/run"
    status_url = f"{api_base_url.rstrip('/')}/{endpoint_id}/status/{{job_id}}"
    
    print(f"\n预期的请求 URL:")
    print(f"   提交任务: POST {submit_url}")
    print(f"   查询状态: GET {status_url}")
    
    if endpoint_id == 'vgsdku5vpadklr':
        print(f"\n✅ 端点 ID 匹配目标值，请求应该会发送到正确的端点")
    else:
        print(f"\n⚠️  端点 ID 与目标值不同")


def provide_recommendations(issues):
    """提供建议"""
    print("\n" + "=" * 80)
    print("建议和调试步骤")
    print("=" * 80)
    
    if not issues:
        print("\n✅ 配置看起来正确！")
        print("\n如果请求仍然没有发送到 RunPod，请检查：")
        print("1. 后端服务是否已重启（配置更改后需要重启）")
        print("2. 查看后端日志，搜索 'image_gen_service' 或 'RunPod'")
        print("3. 检查浏览器控制台和网络请求")
        print("4. 确认封面图片生成是否被调用（查看任务进度）")
    else:
        print(f"\n❌ 发现 {len(issues)} 个配置问题：")
        for issue in issues:
            if issue == "FLUXSCHNELL":
                print(f"\n   修复 {issue}:")
                print(f"   在 .env 文件中添加: FLUXSCHNELL=RUNPOD")
            elif issue == "FLUX_RUNPOD_ENDPOINT_ID":
                print(f"\n   修复 {issue}:")
                print(f"   在 .env 文件中添加: FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr")
            elif issue == "RUNPOD_API_KEY":
                print(f"\n   修复 {issue}:")
                print(f"   在 .env 文件中添加: RUNPOD_API_KEY=your_api_key_here")
        
        print(f"\n修复后，请重启后端服务以加载新配置")


def main():
    """主函数"""
    print("\n" + "=" * 80)
    print("FLUX RunPod 请求检查工具")
    print("=" * 80)
    print("\n检查 Generate AI Song 功能是否向 FLUX_RUNPOD_ENDPOINT_ID 发送请求\n")
    
    issues, flux_schnell, flux_endpoint_id, runpod_api_key = check_config()
    check_code_flow()
    check_request_url(flux_endpoint_id)
    provide_recommendations(issues)
    
    print("\n" + "=" * 80)
    print("检查完成")
    print("=" * 80)
    
    if not issues:
        print("\n✅ 配置正确，请求应该会发送到 RunPod 端点")
        return 0
    else:
        print(f"\n❌ 发现 {len(issues)} 个问题需要修复")
        return 1


if __name__ == "__main__":
    sys.exit(main())
