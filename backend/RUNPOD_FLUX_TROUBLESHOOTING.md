# RunPod FLUX Endpoint 没有收到请求 - 排查指南

## 问题描述
RunPod FLUX endpoint 没有收到任何请求。

## 可能的原因和解决方案

### 1. 后端服务没有重启 ⚠️ **最常见的原因**

**问题**：修改 `.env` 文件后，后端服务需要重启才能加载新的环境变量。

**解决方案**：
1. 停止当前运行的后端服务（如果正在运行）
2. 重新启动后端服务
3. 确认启动日志中显示配置已加载

**检查方法**：
```bash
# 查看后端进程
ps aux | grep uvicorn

# 重启后端服务
# 在 backend 目录下运行
uvicorn app.main:app --reload
```

### 2. 环境变量没有正确设置

**检查配置**：
```bash
cd backend
grep -E "(FLUXSCHNELL|FLUX_RUNPOD_ENDPOINT_ID|RUNPOD_API_KEY)" .env
```

**应该看到**：
```
FLUXSCHNELL=RUNPOD
FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr
RUNPOD_API_KEY=your_runpod_api_key_here
```

### 3. Provider 选择逻辑问题

代码会按以下顺序选择 provider：
1. `FLUXSCHNELL` 环境变量（优先级最高）
2. `settings.flux_schnell_provider` 配置
3. 默认使用 `HUGGINGFACE`

**检查方法**：
查看后端日志，应该看到：
```
[image_gen_service] Provider selection - env_provider='RUNPOD', config_provider='...'
[image_gen_service] Selected provider: RUNPOD
[image_gen_service] RunPod submit URL: https://api.runpod.ai/v2/vgsdku5vpadklr/run
```

如果看到 `Selected provider: HUGGINGFACE`，说明配置没有正确加载。

### 4. 配置加载问题

**检查配置对象**：
代码使用 `pydantic_settings` 从 `.env` 文件加载配置。确保：
- `.env` 文件在 `backend` 目录下
- `.env` 文件格式正确（没有语法错误）
- 后端服务从 `backend` 目录启动

### 5. 代码执行路径问题

**检查流程**：
1. 前端调用 `POST /api/generate`
2. `generate.py` 检查 `FLUXSCHNELL` 环境变量
3. 如果 `FLUXSCHNELL=RUNPOD`，使用 `BackgroundTasks` 而不是 Celery
4. `music_generation.py` 调用 `generate_cover_image()`
5. `image_gen_service.py` 检查 provider 并调用 `_generate_via_runpod()`

**调试日志**：
我已经添加了详细的调试日志。查看后端日志，应该看到：
```
[image_gen_service] generate_cover_image called: prompt='...'
[image_gen_service] Provider selection - env_provider='RUNPOD', config_provider='...'
[image_gen_service] Selected provider: RUNPOD
[image_gen_service] Generating image via RunPod: prompt='...'
[image_gen_service] RunPod endpoint_id: vgsdku5vpadklr
[image_gen_service] RunPod submit URL: https://api.runpod.ai/v2/vgsdku5vpadklr/run
[image_gen_service] RunPod job submitted: {job_id}
```

## 排查步骤

### 步骤 1: 确认配置
```bash
cd backend
cat .env | grep -E "(FLUXSCHNELL|FLUX_RUNPOD_ENDPOINT_ID|RUNPOD_API_KEY)"
```

### 步骤 2: 重启后端服务
```bash
# 停止当前服务（Ctrl+C 或 kill 进程）
# 然后重新启动
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

### 步骤 3: 测试生成
1. 在前端页面点击 "Generate AI Song"
2. 查看后端日志输出
3. 检查是否有 RunPod 相关的日志

### 步骤 4: 检查日志
在后端日志中搜索：
- `[image_gen_service]` - 查看 provider 选择
- `RunPod` - 查看 RunPod 相关日志
- `Selected provider` - 确认使用的 provider

### 步骤 5: 验证请求
如果日志显示发送了请求，但 RunPod 没有收到：
1. 检查网络连接
2. 检查 RunPod API key 是否有效
3. 检查 endpoint ID 是否正确
4. 查看 RunPod 控制台的日志

## 常见错误

### 错误 1: Provider 仍然是 HUGGINGFACE
**原因**：环境变量没有加载
**解决**：重启后端服务

### 错误 2: FLUX_RUNPOD_ENDPOINT_ID 未设置
**原因**：`.env` 文件中没有设置或格式错误
**解决**：检查 `.env` 文件，确保格式正确

### 错误 3: 请求发送但 RunPod 没有收到
**原因**：可能是网络问题、API key 无效或 endpoint ID 错误
**解决**：
- 检查 RunPod 控制台
- 验证 API key 和 endpoint ID
- 查看 RunPod 的日志

## 快速检查清单

- [ ] `.env` 文件中 `FLUXSCHNELL=RUNPOD` 已设置
- [ ] `.env` 文件中 `FLUX_RUNPOD_ENDPOINT_ID=vgsdku5vpadklr` 已设置
- [ ] `.env` 文件中 `RUNPOD_API_KEY` 已设置
- [ ] 后端服务已重启（修改 `.env` 后）
- [ ] 后端日志显示 `Selected provider: RUNPOD`
- [ ] 后端日志显示 `RunPod submit URL: https://api.runpod.ai/v2/vgsdku5vpadklr/run`
- [ ] RunPod 控制台显示收到请求

## 如果问题仍然存在

1. **查看完整日志**：检查后端服务的完整输出
2. **检查网络**：确认服务器可以访问 `api.runpod.ai`
3. **验证 RunPod 配置**：在 RunPod 控制台确认 endpoint 状态
4. **测试 API**：使用 curl 直接测试 RunPod API

```bash
# 测试 RunPod API（替换 YOUR_API_KEY 和 ENDPOINT_ID）
curl -X POST https://api.runpod.ai/v2/vgsdku5vpadklr/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"input": {"prompt": "test"}}'
```
