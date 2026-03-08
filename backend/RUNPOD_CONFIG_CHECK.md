# RunPod 配置检查报告

## 📋 配置要求总结

### 1. 音乐生成配置

如果使用 RunPod 进行音乐生成，需要在 `.env` 文件中配置：

```bash
# 选择 RunPod 作为音乐生成后端
MUSIC_GENERATION_BACKEND=runpod

# RunPod API 配置
RUNPOD_API_KEY=your_api_key_here
RUNPOD_ENDPOINT_ID=your_music_endpoint_id_here

# 可选配置（有默认值）
RUNPOD_API_BASE_URL=https://api.runpod.ai/v2
RUNPOD_REQUEST_TIMEOUT_SECONDS=30
```

**配置项说明：**
- `RUNPOD_API_KEY`: RunPod API 密钥，从 [RunPod 控制台](https://www.runpod.io/console/settings/api-keys) 获取
- `RUNPOD_ENDPOINT_ID`: 音乐生成的端点 ID，从 [RunPod Serverless](https://www.runpod.io/console/serverless) 获取

### 2. 封面图片生成配置

如果使用 RunPod 进行封面图片生成，需要在 `.env` 文件中配置：

```bash
# 选择 RunPod 作为 FLUX 提供商
FLUXSCHNELL=RUNPOD

# FLUX RunPod 端点配置
FLUX_RUNPOD_ENDPOINT_ID=your_image_endpoint_id_here

# 共享同一个 API Key（如果音乐生成也使用 RunPod）
RUNPOD_API_KEY=your_api_key_here
```

**配置项说明：**
- `FLUXSCHNELL`: 设置为 `RUNPOD` 使用 RunPod，设置为 `huggingface`（默认）使用 Hugging Face
- `FLUX_RUNPOD_ENDPOINT_ID`: 封面图片生成的端点 ID，可能与音乐生成的端点不同
- `RUNPOD_API_KEY`: 与音乐生成共享同一个 API Key

## 🔍 配置检查方法

### 方法 1: 使用检查脚本

运行配置检查脚本：

```bash
cd backend
python3 verify_runpod_config.py
```

### 方法 2: 手动检查

1. **检查 .env 文件**
   ```bash
   cd backend
   # 查看 RunPod 相关配置（不显示敏感信息）
   grep -E "(RUNPOD|FLUX)" .env | sed 's/=.*/=***/'
   ```

2. **检查环境变量**
   ```bash
   echo $RUNPOD_API_KEY
   echo $RUNPOD_ENDPOINT_ID
   echo $FLUX_RUNPOD_ENDPOINT_ID
   echo $FLUXSCHNELL
   ```

3. **检查代码中的配置使用**

   - 音乐生成配置位置：
     - `backend/app/core/config.py`: `runpod_api_key`, `runpod_endpoint_id`
     - `backend/app/services/runpod_music_service.py`: 使用配置的地方
   
   - 封面图片配置位置：
     - `backend/app/core/config.py`: `flux_runpod_endpoint_id`, `flux_schnell_provider`
     - `backend/app/services/image_gen_service.py`: 使用配置的地方

## ✅ 配置验证清单

### 音乐生成配置检查

- [ ] `MUSIC_GENERATION_BACKEND=runpod` 已设置
- [ ] `RUNPOD_API_KEY` 已设置且有效
- [ ] `RUNPOD_ENDPOINT_ID` 已设置且有效
- [ ] 后端服务已重启以加载配置

### 封面图片生成配置检查

- [ ] `FLUXSCHNELL=RUNPOD` 已设置（如果要使用 RunPod）
- [ ] `FLUX_RUNPOD_ENDPOINT_ID` 已设置且有效（如果使用 RunPod）
- [ ] `RUNPOD_API_KEY` 已设置且有效（如果使用 RunPod）
- [ ] 后端服务已重启以加载配置

## 🐛 常见问题

### 问题 1: 配置已设置但不起作用

**可能原因：**
- 后端服务未重启，配置未加载
- `.env` 文件路径不正确
- 环境变量名称拼写错误

**解决方法：**
1. 确认 `.env` 文件在 `backend/` 目录下
2. 重启后端服务
3. 检查配置项名称是否正确（注意大小写）

### 问题 2: 音乐生成和封面图片使用不同的端点

**说明：**
这是正常的！音乐生成和封面图片可以使用不同的 RunPod 端点：
- 音乐生成使用 `RUNPOD_ENDPOINT_ID`
- 封面图片使用 `FLUX_RUNPOD_ENDPOINT_ID`

它们共享同一个 `RUNPOD_API_KEY`。

### 问题 3: 如何获取 RunPod 配置信息

1. **获取 API Key：**
   - 登录 [RunPod 控制台](https://www.runpod.io/console)
   - 前往：Settings -> API Keys
   - 创建或复制 API Key

2. **获取 Endpoint ID：**
   - 登录 [RunPod 控制台](https://www.runpod.io/console)
   - 前往：Serverless -> 你的端点
   - 复制 Endpoint ID（通常是一个字符串，如 `vgsdku5vpadklr`）

## 📝 配置示例

### 完整配置示例（音乐 + 封面图片都使用 RunPod）

```bash
# 音乐生成
MUSIC_GENERATION_BACKEND=runpod
RUNPOD_API_KEY=rp_live_xxxxxxxxxxxxxxxxxxxxx
RUNPOD_ENDPOINT_ID=xxxxxxxxxxxxxxxx

# 封面图片生成
FLUXSCHNELL=RUNPOD
FLUX_RUNPOD_ENDPOINT_ID=yyyyyyyyyyyyyyyy
```

### 混合配置示例（音乐用 RunPod，封面用 Hugging Face）

```bash
# 音乐生成
MUSIC_GENERATION_BACKEND=runpod
RUNPOD_API_KEY=rp_live_xxxxxxxxxxxxxxxxxxxxx
RUNPOD_ENDPOINT_ID=xxxxxxxxxxxxxxxx

# 封面图片生成（使用 Hugging Face）
FLUXSCHNELL=huggingface
HUGGINGFACE_HUB_TOKEN=your_hf_token_here
```

## 🔗 相关文档

- [RunPod API 文档](https://docs.runpod.io/serverless/endpoints)
- [FLUX.1 Schnell 模型](https://huggingface.co/black-forest-labs/FLUX.1-schnell)
- [配置示例文件](env.example)
