# AI Music Backend

FastAPI + SQLModel + Celery backend for the AI Music app.

## Structure

- `app/main.py`: FastAPI app entry
- `app/api/`: API routers (auth/users/songs/generate/...)
- `app/models/`: SQLModel models
- `app/services/`: domain services (auth, generation, storage, payments, shares)
- `app/tasks/`: Celery tasks

## Environment

Copy `./env.example` to `./.env` and adjust values.

## RunPod Serverless (Polling mode, no Celery)

This repo supports an additional music generation flow that **does not use Celery**:

- React `POST /api/music/generate`
- FastAPI calls RunPod Serverless `POST https://api.runpod.ai/v2/{endpoint_id}/run`
- Client polls `GET /api/music/status/{job_id}` until it returns `status=completed` with `result.output_url`

Enable it via `.env`:

- **`MUSIC_GENERATION_BACKEND=runpod`**
- **`RUNPOD_API_KEY=...`**
- **`RUNPOD_ENDPOINT_ID=...`**

Frontend toggle (Vite env):

- **`VITE_MUSIC_GEN_TRANSPORT=polling`** (default is `sse`)

##步骤 A：获取并安装到后端虚拟环境
# 1. 进入后端项目目录
cd /Users/xiu/Documents/LLMApp/AIMusic/AIMusicCode/backend

# 2. 激活你后端用的虚拟环境（示例）
source .venv/bin/activate  # 按你自己的 venv 改

# 3. 克隆 ACE-Step 仓库（路径随意）
cd ..
git clone https://github.com/ace-step/ACE-Step-1.5.git
cd ACE-Step-1.5

# 4. 安装为 python 包（推荐可编辑安装，方便以后改）
pip install -e .

##步骤 B：确保入口函数名正确
记下模块路径 + 函数名，比如：
模块：ace_step.inference
函数：generate
在运行环境里设置：
ACE_STEP_ENTRYPOINT=ace_step.inference:generateACE_STEP_MODEL_DIR=/你的/模型目录/路径ACE_STEP_DEVICE=mps 


