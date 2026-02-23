# AI 音乐生成平台（MVP 骨架）

本仓库是一个类 Suno/Udio 的 AI 音乐生成 SaaS 平台 **可运行骨架**（前端 + 后端 + Redis + Postgres）。

## 目录结构

- `frontend/`: React 18 + TypeScript + Vite + Tailwind
- `backend/`: FastAPI + SQLModel + Postgres + Redis + Celery + SSE

## 本地启动（推荐：Docker 跑依赖，前后端本机跑）

### 1) 启动 Postgres / Redis

```bash
docker compose up -d postgres redis
```

### 2) 启动后端 API

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp env.example .env
uvicorn app.main:app --reload --port 8000
```

后端地址：`http://localhost:8000`

### 3) 启动 Celery worker（用于生成任务）

在另一个终端：

```bash
cd backend
source .venv/bin/activate
celery -A app.worker.celery_app worker -l info --pool=solo
```

**注意**: 使用 `--pool=solo` 避免 ML 模型在 fork 进程时内存溢出。solo 池在单进程中运行（不 fork），更适合加载大型 ML 模型。

### 4) 启动前端

```bash
cd frontend
npm i
cp env.example .env
npm run dev
```

前端地址：`http://localhost:5173`

## Docker 一键启动（可选）

如果你希望 **Postgres + Redis + FastAPI + Celery worker** 都跑在 Docker 里：

```bash
docker compose up -d --build
```

后端地址：`http://localhost:8000`（健康检查：`GET /health` 会返回 db/redis 状态）

## MVP 功能说明（已落地的最小实现）

- 邮箱注册/登录（JWT）
- 生成任务：POST 创建任务 + GET SSE 订阅进度（Celery 更新 Redis，SSE 轮询 Redis）
- 歌曲库：创建/列表/详情（示例字段）
- 文件存储：默认本地磁盘 `backend/.data/`（可切换到 S3/R2）

## API 速览

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/users/me`
- `POST /api/generate` → `{task_id, events_url}`
- `GET /api/generate/events/{task_id}` (SSE)
- `GET /api/songs` / `POST /api/songs`
- `GET /api/songs/{song_id}`

## 下一步

- 接入真实推理（ACE-Step/RunPod），替换 `music_gen_service.py` 的模拟生成
- 增加下载 WAV、封面、公开广场、分享、Stripe 订阅等模块


