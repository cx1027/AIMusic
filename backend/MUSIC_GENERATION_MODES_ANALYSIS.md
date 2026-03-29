# 音乐生成方式分析

## 概述

在 `http://localhost:5173/generate` 页面点击 'Generate AI Song' 按钮后，系统支持3种音乐生成方式。生成方式的选择由前端和后端的配置决定。

---

## 配置要求

### 方式1: RunPod Serverless (Polling模式)

**前端配置**:
```bash
VITE_MUSIC_GEN_TRANSPORT=polling
```

**后端配置**:
```bash
MUSIC_GENERATION_BACKEND=runpod
RUNPOD_API_KEY=your_api_key
RUNPOD_ENDPOINT_ID=your_endpoint_id
```

### 方式2: Celery + ACE-Step API (SSE模式，默认)

**前端配置** (默认):
```bash
VITE_MUSIC_GEN_TRANSPORT=sse  # 默认值
```

**后端配置** (默认):
```bash
MUSIC_GENERATION_BACKEND=celery  # 默认值
```

**ACE-Step API 服务** (需要单独运行):
- 服务地址: `http://127.0.0.1:8001`
- 由 `/Users/xiu/Documents/LLMApp/ACE-Step-1.5` 启动的本地 API

### 方式3: Celery + 本地ACE-Step推理 (SSE模式，Fallback)

当方式2中的 ACE-Step API 调用失败时，自动回退到此方式。

---

## 合并流程图

```
用户点击 'Generate AI Song'
         |
         v
前端 (Generate.tsx)
         |
         | 验证积分(2积分)
         |
         v
检查 VITE_MUSIC_GEN_TRANSPORT
         |
    +----+----+
    |         |
polling    sse (默认)
    |         |
    v         v
POST        POST
/api/music/ /api/generate
generate    |
    |       |
    |   检查 MUSIC_GENERATION_BACKEND
    |       |
    |   +---+---+
    |   |       |
    | runpod  celery (默认)
    |   |       |
    |   v       v
    | RunPod  Celery Task
    | Serverless  run_generation_task.delay()
    |   |         |
    |   |    返回 {task_id, events_url}
    |   |         |
    |   |    GET /api/generate/events/{task_id} (建立SSE连接)
    |   |         |
    |   |    [SSE推送循环: 每秒检查任务状态]
    |   |         |
    |   |    v
    |   | Celery Worker
    |   |    |
    |   |    | 尝试: POST /release_task
    |   |    v
    |   | ACE-Step API (127.0.0.1:8001)
    |   |    |
    |   |    +----+----+
    |   |    |         |
    |   | 成功      失败
    |   |    |         |
    |   |    |     [捕获异常，记录日志]
    |   |    |         |
    |   |    |    generate_music() (回退到本地推理)
    |   |    |         |
    |   |    |    v
    |   |    | 本地推理服务 (music_gen_service)
    |   |    |    |
    |   |    |    | generate_wav_bytes()
    |   |    |    v
    |   |    | ACE-Step本地服务 (ace_step_service)
    |   |    |    |
    |   |    |    | 加载模型权重
    |   |    |    v
    |   |    | 模型Checkpoints (acestepapp/checkpoints)
    |   |    |    |
    |   |    |    | 本地推理生成音频
    |   |    |    | [如果模型不可用: 使用sine wave]
    |   |    |    |
    |   |    |    v
    |   |    | 返回音频文件
    |   |    |    |
    |   |    v    v
    |   | Celery Worker (收到音频)
    |   |    |
    |   |    | 上传音频文件
    |   |    | 生成封面图片(FLUX.1 Schnell)
    |   |    | 创建Song记录
    |   |    | 更新任务状态=completed
    |   |    |
    |   |    | SSE推送: 任务完成
    |   |    |
    |   |    v
    |   | 前端
    |   |    |
    |   |    | 显示生成的音乐
    |   |    |
    |   |    v
    |   | 用户
    |   |
    |   | 返回 {job_id, runpod_job_id}
    |   |
    |   v
前端
    |
    | [轮询循环: 每2秒]
    | GET /api/music/status/{job_id}
    |
    v
后端API
    |
    | 查询状态(get_runpod_status)
    |
    v
RunPod Serverless
    |
    | 返回状态
    |
    v
后端API
    |
    | 返回状态更新
    |
    v
前端
    |
    | [继续轮询直到完成]
    |
    |
RunPod Serverless (并行处理)
    |
    | 生成音频(MP3)
    | 上传音频文件到R2存储
    |
    v
R2存储
    |
    | 状态: COMPLETED, output_url
    |
    v
后端API
    |
    | 启动后台任务(_finalize_runpod_job)
    | 生成封面图片(FLUX.1 Schnell)
    | 创建Song记录
    | 任务完成
    |
    v
前端
    |
    | 显示生成的音乐
    |
    v
用户
```

---

## 方式特点

### 方式1: RunPod Serverless (Polling模式)
- ✅ **无需 Celery**: 直接使用 FastAPI BackgroundTasks
- ✅ **云端生成**: 音频在 RunPod 服务器上生成
- ✅ **自动上传**: RunPod 自动上传到 R2
- ✅ **轮询模式**: 前端每2秒轮询一次状态
- ⚠️ **需要 RunPod 配置**: 需要有效的 API Key 和 Endpoint ID

### 方式2: Celery + ACE-Step API (SSE模式，默认)
- ✅ **实时更新**: 使用 SSE 推送进度，无需轮询
- ✅ **异步处理**: 使用 Celery 处理长时间任务
- ✅ **API优先**: 优先使用 ACE-Step API，性能更好
- ✅ **自动回退**: API 失败时自动切换到本地推理
- ⚠️ **需要 ACE-Step API**: 需要单独运行 ACE-Step API 服务
- ⚠️ **需要 Celery**: 需要运行 Celery worker

### 方式3: Celery + 本地ACE-Step推理 (SSE模式，Fallback):已去掉
- ✅ **自动回退**: API 失败时自动切换
- ✅ **本地推理**: 不依赖外部 API
- ⚠️ **需要模型文件**: 需要下载 ACE-Step 模型权重到 `backend/acestepapp/checkpoints`
- ⚠️ **性能较低**: 本地推理速度较慢
- ⚠️ **资源消耗**: 需要足够的 GPU/CPU 资源

---

## 配置对比表

| 特性 | 方式1: RunPod | 方式2: Celery+API | 方式3: Celery+本地 |
|------|--------------|-------------------|-------------------|
| **前端传输** | Polling | SSE | SSE |
| **后端任务** | BackgroundTasks | Celery | Celery |
| **生成位置** | RunPod云端 | ACE-Step API | 本地服务器 |
| **需要Celery** | ❌ | ✅ | ✅ |
| **需要RunPod** | ✅ | ❌ | ❌ |
| **需要ACE-Step API** | ❌ | ✅ | ❌ |
| **需要本地模型** | ❌ | ❌ | ✅ |
| **实时性** | 轮询(2s) | SSE推送 | SSE推送 |
| **性能** | 高(云端GPU) | 高(专用API) | 中(本地资源) |
| **成本** | RunPod费用 | API服务费用 | 服务器资源 |

---

## 当前默认配置

- **前端**: `VITE_MUSIC_GEN_TRANSPORT=sse` (SSE模式)
- **后端**: `MUSIC_GENERATION_BACKEND=celery` (Celery模式)

因此，默认情况下使用的是**方式2: Celery + ACE-Step API**。

如果要切换到 RunPod 模式，需要：
1. 后端设置: `MUSIC_GENERATION_BACKEND=runpod`
2. 前端设置: `VITE_MUSIC_GEN_TRANSPORT=polling`
