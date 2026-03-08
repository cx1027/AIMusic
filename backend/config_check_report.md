# 封面图片生成配置检查报告

## 检查结果

**检查时间**: 刚刚执行
**Provider**: HUGGINGFACE (默认)

### 当前状态

❌ **配置不完整** - 缺少必要的 Hugging Face Token

### 详细检查

#### 环境变量检查
- `FLUXSCHNELL`: 未设置 (默认使用 HUGGINGFACE)
- `HUGGINGFACE_HUB_TOKEN`: ❌ 未设置
- `HUGGINGFACE_TOKEN`: ❌ 未设置  
- `HF_TOKEN`: ❌ 未设置
- `FLUX_RUNPOD_ENDPOINT_ID`: 未设置 (使用 Hugging Face 时不需要)
- `RUNPOD_API_KEY`: 未设置 (使用 Hugging Face 时不需要)

### 配置代码逻辑

根据 `backend/app/services/image_gen_service.py`，代码会按以下顺序查找 Hugging Face Token：

1. `settings.huggingface_token` (从 `.env` 文件读取)
2. `HUGGINGFACE_HUB_TOKEN` (环境变量，推荐)
3. `HF_TOKEN` (环境变量)
4. Hugging Face CLI 登录的 token (如果已登录)

### 修复步骤

#### 选项 1: 使用 Hugging Face (推荐)

1. **接受模型许可**
   - 访问: https://huggingface.co/black-forest-labs/FLUX.1-schnell
   - 点击 "Agree and access repository"

2. **获取 Token**
   - 访问: https://huggingface.co/settings/tokens
   - 创建新 token (Read 权限即可)
   - 复制 token

3. **配置环境变量**

   在 `backend/.env` 文件中添加：
   ```bash
   HUGGINGFACE_HUB_TOKEN=your_token_here
   ```
   
   或者导出环境变量：
   ```bash
   export HUGGINGFACE_HUB_TOKEN=your_token_here
   ```

#### 选项 2: 使用 RunPod

在 `backend/.env` 文件中添加：
```bash
FLUXSCHNELL=RUNPOD
FLUX_RUNPOD_ENDPOINT_ID=your_endpoint_id
RUNPOD_API_KEY=your_api_key
```

### 验证配置

运行以下命令验证配置：
```bash
cd backend
python check_config_simple.py
```

### 相关文件

- 配置示例: `backend/env.example`
- 详细指南: `backend/COVER_IMAGE_SETUP.md`
- 检查脚本: `backend/check_config_simple.py`
- 服务代码: `backend/app/services/image_gen_service.py`
