# FLUX RunPod 请求检查报告

## 📋 检查目标

验证在 `http://localhost:5173/generate` 页面点击 "Generate AI Song" 后，是否有请求发送到 `FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr`。

## 🔍 请求流程分析

### 1. 前端流程

```
用户点击 "Generate AI Song" 按钮
  ↓
frontend/src/pages/Generate.tsx:101 (start 函数)
  ↓
POST /api/generate (包含 prompt, lyrics, duration 等参数)
```

### 2. 后端流程

```
POST /api/generate
  ↓
backend/app/api/routes/generate.py:36 (create_generation)
  ↓
启动后台任务: run_generation_task
  ↓
backend/app/tasks/music_generation.py:20 (run_generation_task)
  ↓
生成音乐完成后，调用封面图片生成
  ↓
backend/app/tasks/music_generation.py:114 (generate_cover_image)
  ↓
backend/app/services/image_gen_service.py:265 (generate_cover_image)
```

### 3. 封面图片生成流程

```
generate_cover_image() 函数会：
  1. 检查 FLUXSCHNELL 环境变量或 flux_schnell_provider 配置
  2. 如果 FLUXSCHNELL=RUNPOD，调用 _generate_via_runpod()
  3. 如果 FLUXSCHNELL=huggingface 或未设置，调用 _generate_via_huggingface()
```

### 4. RunPod 请求流程

```
_generate_via_runpod() 函数会：
  1. 获取 FLUX_RUNPOD_ENDPOINT_ID (从环境变量或配置)
  2. 获取 RUNPOD_API_KEY (从环境变量或配置)
  3. 构建请求 URL: https://api.runpod.ai/v2/{endpoint_id}/run
  4. 发送 POST 请求提交任务
  5. 轮询状态: https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}
```

## ✅ 配置要求

要让请求发送到 `FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr`，需要满足以下条件：

### 必需配置

1. **FLUXSCHNELL=RUNPOD**
   - 环境变量或 `.env` 文件中的 `FLUXSCHNELL` 必须设置为 `RUNPOD`
   - 或者在 `.env` 文件中设置 `flux_schnell_provider=runpod`

2. **FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr**
   - 环境变量或 `.env` 文件中的 `FLUX_RUNPOD_ENDPOINT_ID` 必须设置为 `vgsdku5vpadklr`
   - 或者在 `.env` 文件中设置 `flux_runpod_endpoint_id=vgsdku5vpadklr`

3. **RUNPOD_API_KEY**
   - 环境变量或 `.env` 文件中的 `RUNPOD_API_KEY` 必须设置
   - 或者在 `.env` 文件中设置 `runpod_api_key=your_api_key`

### 配置示例

在 `backend/.env` 文件中添加：

```bash
# 使用 RunPod 作为 FLUX 提供商
FLUXSCHNELL=RUNPOD

# RunPod 端点 ID（封面图片生成）
FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr

# RunPod API Key（与音乐生成共享）
RUNPOD_API_KEY=your_api_key_here
```

## 🔍 验证方法

### 方法 1: 检查配置

运行检查脚本：

```bash
cd backend
python3 check_flux_runpod_request.py
```

### 方法 2: 查看后端日志

启动后端服务后，查看日志输出。当封面图片生成时，应该看到：

```
[image_gen_service] Using FLUX.1 Schnell provider: RUNPOD
[image_gen_service] Generating image via RunPod: prompt='...'
[image_gen_service] RunPod job submitted: {job_id}
```

### 方法 3: 检查网络请求

如果后端服务有网络监控，可以检查是否有请求发送到：

```
POST https://api.runpod.ai/v2/vgsdku5vpadklr/run
GET  https://api.runpod.ai/v2/vgsdku5vpadklr/status/{job_id}
```

### 方法 4: 在代码中添加日志

在 `backend/app/services/image_gen_service.py` 的 `_generate_via_runpod()` 函数中，第 83 行已经会记录请求 URL：

```python
submit_url = f"{api_base_url.rstrip('/')}/{endpoint_id}/run"
```

可以添加更详细的日志：

```python
logger.info(f"[image_gen_service] RunPod submit URL: {submit_url}")
logger.info(f"[image_gen_service] RunPod endpoint ID: {endpoint_id}")
```

## 🐛 常见问题

### 问题 1: 请求没有发送到 RunPod

**可能原因：**
- `FLUXSCHNELL` 未设置为 `RUNPOD`，默认使用 Hugging Face
- `FLUX_RUNPOD_ENDPOINT_ID` 未设置或设置错误
- 后端服务未重启，配置未加载

**解决方法：**
1. 检查 `.env` 文件中的配置
2. 确认 `FLUXSCHNELL=RUNPOD` 已设置
3. 确认 `FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr` 已设置
4. 重启后端服务

### 问题 2: 端点 ID 不匹配

**检查：**
- 确认 `.env` 文件中的 `FLUX_RUNPOD_ENDPOINT_ID` 值是否为 `vgsdku5vpadklr`
- 检查是否有拼写错误或多余的空格

### 问题 3: 请求发送但失败

**可能原因：**
- `RUNPOD_API_KEY` 无效或未设置
- 端点 ID 不存在或无权访问
- 网络连接问题

**解决方法：**
1. 验证 API Key 是否有效
2. 在 RunPod 控制台确认端点 ID 是否正确
3. 检查网络连接和防火墙设置

## 📝 代码位置参考

### 关键文件

1. **封面图片生成入口**
   - `backend/app/services/image_gen_service.py:265` - `generate_cover_image()`
   - `backend/app/services/image_gen_service.py:288` - 提供商选择逻辑

2. **RunPod 请求实现**
   - `backend/app/services/image_gen_service.py:29` - `_generate_via_runpod()`
   - `backend/app/services/image_gen_service.py:83` - 构建请求 URL
   - `backend/app/services/image_gen_service.py:94` - 发送 POST 请求
   - `backend/app/services/image_gen_service.py:112` - 轮询状态

3. **任务调用**
   - `backend/app/tasks/music_generation.py:114` - 调用 `generate_cover_image()`

4. **API 路由**
   - `backend/app/api/routes/generate.py:36` - `create_generation()` 处理前端请求

## 🎯 快速检查清单

- [ ] `FLUXSCHNELL=RUNPOD` 已设置
- [ ] `FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr` 已设置
- [ ] `RUNPOD_API_KEY` 已设置
- [ ] 后端服务已重启
- [ ] 后端日志显示 "Using FLUX.1 Schnell provider: RUNPOD"
- [ ] 后端日志显示 "RunPod job submitted"
- [ ] 网络请求发送到 `https://api.runpod.ai/v2/vgsdku5vpadklr/run`

## 📞 调试建议

1. **启用详细日志**
   - 确保日志级别设置为 `INFO` 或 `DEBUG`
   - 查看 `backend/app/services/image_gen_service.py` 中的日志输出

2. **测试配置加载**
   - 运行 `python3 check_flux_runpod_request.py` 检查配置
   - 确认配置对象正确加载了所有值

3. **手动测试**
   - 可以在 Python 交互式环境中测试：
   ```python
   from app.services.image_gen_service import generate_cover_image
   result = generate_cover_image(prompt="test prompt", title="Test")
   ```

4. **检查任务进度**
   - 在前端查看任务进度，确认封面图片生成阶段是否执行
   - 查看是否有封面图片生成错误信息
