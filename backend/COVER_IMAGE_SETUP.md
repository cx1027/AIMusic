# Cover Image Generation Setup Guide

封面图片生成功能使用 FLUX.1 Schnell 模型。你需要配置以下选项之一：

## 选项 1: 使用 Hugging Face（推荐，默认）

这是最简单的方式，使用 Hugging Face Inference API。

### 步骤：

1. **接受模型许可**
   - 访问：https://huggingface.co/black-forest-labs/FLUX.1-schnell
   - 点击 "Agree and access repository" 接受许可

2. **获取 Hugging Face Token**
   - 访问：https://huggingface.co/settings/tokens
   - 创建一个新的 token（Read 权限即可）
   - 复制 token

3. **配置环境变量**

   在 `backend/.env` 文件中添加：
   ```bash
   # FLUX.1 Schnell image generation (Hugging Face)
   FLUXSCHNELL=huggingface
   HUGGINGFACE_HUB_TOKEN=your_token_here
   ```

   或者直接导出环境变量：
   ```bash
   export HUGGINGFACE_HUB_TOKEN=your_token_here
   ```

## 选项 2: 使用 RunPod Serverless

如果你有 RunPod 账户并已部署 FLUX.1 Schnell 端点。

### 步骤：

1. **获取 RunPod API Key**
   - 登录 RunPod 控制台
   - 前往：Settings -> API Keys
   - 创建或复制 API Key

2. **获取 RunPod Endpoint ID**
   - 在 RunPod 控制台：Serverless -> 你的端点
   - 复制 Endpoint ID（例如：`vgsdku5vpadklr`）

3. **配置环境变量**

   在 `backend/.env` 文件中添加：
   ```bash
   # FLUX.1 Schnell image generation (RunPod)
   FLUXSCHNELL=RUNPOD
   FLUX_RUNPOD_ENDPOINT_ID=your_endpoint_id_here
   RUNPOD_API_KEY=your_api_key_here
   ```

   或者直接导出环境变量：
   ```bash
   export FLUXSCHNELL=RUNPOD
   export FLUX_RUNPOD_ENDPOINT_ID=your_endpoint_id_here
   export RUNPOD_API_KEY=your_api_key_here
   ```

## 验证配置

配置完成后，重启后端服务。生成音乐时，如果配置正确，封面图片应该会自动生成。

如果仍然看到错误信息，请检查：
1. 环境变量是否正确设置
2. Token/API Key 是否有效
3. 后端服务是否已重启以加载新的环境变量

## 故障排除

### Hugging Face 错误
- 确保已接受模型许可
- 检查 token 是否正确
- 确认 token 有 Read 权限

### RunPod 错误
- 确认端点 ID 正确
- 检查 API Key 是否有效
- 确认端点已正确部署 FLUX.1 Schnell 模型
