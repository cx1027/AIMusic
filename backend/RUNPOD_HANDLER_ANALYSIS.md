# RunPod Handler 核心函数调用检查报告

## 概述

`runpod_music_service.py` 是一个**客户端服务**，它只负责：
1. 提交任务到 RunPod Serverless (`submit_runpod_job`)
2. 轮询任务状态 (`get_runpod_status`)

**重要**：`runpod_music_service.py` **不直接调用**这些核心函数。这些核心函数应该在 **RunPod endpoint 端（服务器端）** 被调用。

---

## 当前状态分析

### `runpod_music_service.py` 当前实现

**文件位置**：`backend/app/services/runpod_music_service.py`

**功能**：
- ✅ `submit_runpod_job()` - 提交任务到 RunPod API
- ✅ `get_runpod_status()` - 获取任务状态

**当前发送到 RunPod 的输入**（来自 `backend/app/api/routes/music.py:145-148`）：
```python
runpod_input = {
    "prompt": runpod_prompt,  # sample_query (simple mode) 或 prompt (custom mode)
    "duration": audio_duration_int,
}
```

**问题**：当前只传递了 `prompt` 和 `duration`，**缺少**以下关键参数：
- `mode` (simple/custom)
- `lyrics`
- `thinking`
- `bpm`
- `vocal_language`
- `inference_steps`
- `batch_size`
- 等等...

---

## 核心函数调用流程说明

### 1. `create_sample()` [inference.py:1008]

**功能**：Simple 模式 - 从自然语言查询生成完整样本

**调用位置**：应该在 RunPod endpoint 端调用

**调用方式**（参考 `api_server.py:1416-1425`）：
```python
sample_result = create_sample(
    llm_handler=llm,
    query=sample_query,  # 用户的自然语言描述
    instrumental=parsed_instrumental,
    vocal_language=sample_language,
    temperature=req.lm_temperature,
    top_k=lm_top_k if lm_top_k > 0 else None,
    top_p=lm_top_p if lm_top_p < 1.0 else None,
    use_constrained_decoding=True,
)

# 使用生成的结果
caption = sample_result.caption
lyrics = sample_result.lyrics
bpm = sample_result.bpm
key_scale = sample_result.keyscale
time_signature = sample_result.timesignature
audio_duration = sample_result.duration
```

**何时调用**：
- 当 `mode == "simple"` 时
- 在 RunPod endpoint 端，接收到 `sample_query` 参数时

**当前状态**：❌ **未调用** - `runpod_music_service.py` 只发送了 `prompt` 和 `duration`，没有传递 `mode` 和 `sample_query`

---

### 2. `format_sample()` [inference.py:1182]

**功能**：Format 模式 - 格式化用户提供的 caption 和 lyrics

**调用位置**：应该在 RunPod endpoint 端调用

**调用方式**（参考 `api_server.py:1459-1468`）：
```python
format_result = format_sample(
    llm_handler=llm,
    caption=caption,
    lyrics=lyrics,
    user_metadata=user_metadata_for_format,  # 包含 bpm, duration, keyscale, timesignature, language
    temperature=req.lm_temperature,
    top_k=lm_top_k if lm_top_k > 0 else None,
    top_p=lm_top_p if lm_top_p < 1.0 else None,
    use_constrained_decoding=True,
)

# 使用格式化的结果
caption = format_result.caption or caption
lyrics = format_result.lyrics or lyrics
if format_result.duration:
    audio_duration = format_result.duration
if format_result.bpm:
    bpm = format_result.bpm
```

**何时调用**：
- 当 `use_format=True` 且提供了 `caption` 或 `lyrics` 时
- 在 RunPod endpoint 端，接收到 `use_format` 参数时

**当前状态**：❌ **未调用** - `runpod_music_service.py` 没有传递 `use_format` 参数

---

### 3. `generate_music()` [inference.py:298]

**功能**：主音乐生成函数，协调 LM 和 DiT 生成

**调用位置**：应该在 RunPod endpoint 端调用

**调用方式**（参考 `api_server.py:1688-1695`）：
```python
result = generate_music(
    dit_handler=h,  # AceStepHandler 实例
    llm_handler=llm_to_pass,  # LLMHandler 实例（如果已初始化）
    params=params,  # GenerationParams 实例
    config=config,  # GenerationConfig 实例
    save_dir=app.state.temp_audio_dir,
    progress=progress_cb,
)
```

**何时调用**：
- 在所有模式（simple/custom）中，最终都会调用此函数
- 在 RunPod endpoint 端，完成 `create_sample()` 或 `format_sample()` 后调用

**当前状态**：❌ **未调用** - `runpod_music_service.py` 只提交任务，不执行生成

---

### 4. `llm_handler.generate_with_stop_condition()` [llm_inference.py:1032]

**功能**：5Hz LM 生成 metadata 和 audio_codes

**调用位置**：在 `generate_music()` 内部调用（inference.py:549）

**调用方式**（参考 `inference.py:549-568`）：
```python
result = llm_handler.generate_with_stop_condition(
    caption=params.caption or "",
    lyrics=params.lyrics or "",
    infer_type=infer_type,  # "llm_dit" 或 "dit"
    temperature=params.lm_temperature,
    cfg_scale=params.lm_cfg_scale,
    negative_prompt=params.lm_negative_prompt,
    top_k=top_k_value,
    top_p=top_p_value,
    target_duration=audio_duration,
    user_metadata=user_metadata_to_pass,
    use_cot_caption=params.use_cot_caption,
    use_cot_language=params.use_cot_language,
    use_cot_metas=params.use_cot_metas,
    use_constrained_decoding=params.use_constrained_decoding,
    constrained_decoding_debug=config.constrained_decoding_debug,
    batch_size=chunk_size,
    seeds=chunk_seeds,
    progress=progress,
)
```

**何时调用**：
- 在 `generate_music()` 内部，当 `use_lm=True` 时
- 模式：
  - `"llm_dit"`: 生成 metadata + audio_codes (两阶段)
  - `"dit"`: 仅生成 metadata (单阶段)

**当前状态**：✅ **间接调用** - 通过 `generate_music()` 调用，但前提是 RunPod endpoint 端正确实现了 `generate_music()`

---

### 5. `dit_handler.generate_music()` [handler.py:3139]

**功能**：DiT 模型执行实际音频生成

**调用位置**：在 `generate_music()` 内部调用（inference.py:656）

**调用方式**（参考 `inference.py:656-684`）：
```python
result = dit_handler.generate_music(
    captions=dit_input_caption,
    lyrics=dit_input_lyrics,
    bpm=bpm,
    key_scale=key_scale,
    time_signature=time_signature,
    vocal_language=dit_input_vocal_language,
    inference_steps=params.inference_steps,
    guidance_scale=params.guidance_scale,
    use_random_seed=config.use_random_seed,
    seed=seed_for_generation,
    reference_audio=params.reference_audio,
    audio_duration=audio_duration,
    batch_size=config.batch_size if config.batch_size is not None else 1,
    src_audio=params.src_audio,
    audio_code_string=audio_code_string_to_use,
    repainting_start=params.repainting_start,
    repainting_end=params.repainting_end,
    instruction=params.instruction,
    audio_cover_strength=params.audio_cover_strength,
    task_type=params.task_type,
    use_adg=params.use_adg,
    cfg_interval_start=params.cfg_interval_start,
    cfg_interval_end=params.cfg_interval_end,
    shift=params.shift,
    infer_method=params.infer_method,
    timesteps=params.timesteps,
    progress=progress,
)
```

**何时调用**：
- 在 `generate_music()` 的 Phase 2（DiT 生成阶段）
- 在所有模式中，最终都会调用此函数来生成音频

**当前状态**：✅ **间接调用** - 通过 `generate_music()` 调用，但前提是 RunPod endpoint 端正确实现了 `generate_music()`

---

## 完整调用流程

### Simple 模式流程

```
1. 客户端 (runpod_music_service.py)
   └─> submit_runpod_job({"prompt": sample_query, "duration": ...})
       └─> RunPod API

2. RunPod Endpoint 端（应该实现）
   ├─> create_sample(llm_handler, query=sample_query, ...)
   │   └─> llm_handler.create_sample_from_query(...)
   │       └─> 返回 CreateSampleResult (caption, lyrics, bpm, etc.)
   │
   ├─> generate_music(dit_handler, llm_handler, params, config)
   │   ├─> Phase 1: LM 生成（如果 thinking=True）
   │   │   └─> llm_handler.generate_with_stop_condition(...)
   │   │       └─> 生成 metadata 和 audio_codes
   │   │
   │   └─> Phase 2: DiT 生成
   │       └─> dit_handler.generate_music(...)
   │           └─> 生成音频文件
   │
   └─> 上传音频到 R2，返回 output_url
```

### Custom 模式流程

```
1. 客户端 (runpod_music_service.py)
   └─> submit_runpod_job({"prompt": prompt, "duration": ...})
       └─> RunPod API

2. RunPod Endpoint 端（应该实现）
   ├─> [可选] format_sample(llm_handler, caption, lyrics, ...)
   │   └─> llm_handler.format_sample_from_input(...)
   │       └─> 返回 FormatSampleResult (增强的 caption, lyrics, metadata)
   │
   ├─> generate_music(dit_handler, llm_handler, params, config)
   │   ├─> Phase 1: LM 生成（如果 thinking=True）
   │   │   └─> llm_handler.generate_with_stop_condition(...)
   │   │
   │   └─> Phase 2: DiT 生成
   │       └─> dit_handler.generate_music(...)
   │
   └─> 上传音频到 R2，返回 output_url
```

---

## 问题与建议

### 当前问题

1. **参数传递不完整**：
   - `runpod_music_service.py` 只发送了 `prompt` 和 `duration`
   - 缺少 `mode`, `lyrics`, `thinking`, `bpm`, `vocal_language`, `inference_steps`, `batch_size` 等参数

2. **RunPod Endpoint 端实现缺失**：
   - 需要确认 RunPod endpoint 端是否实现了这些核心函数的调用
   - 参考实现：`backend/acestepapp/acestep/api_server.py`

### 建议修改

#### 1. 修改 `runpod_music_service.py` 的输入参数

在 `backend/app/api/routes/music.py:145-148` 中，应该传递完整的参数：

```python
runpod_input = {
    "mode": mode,  # "simple" 或 "custom"
    "prompt": prompt,  # custom mode 使用
    "sample_query": sample_query,  # simple mode 使用
    "lyrics": lyrics,
    "thinking": thinking,
    "audio_duration": audio_duration_int,
    "bpm": bpm_int,
    "vocal_language": vocal_language,
    "audio_format": audio_format,
    "inference_steps": inference_steps_int,
    "batch_size": batch_size_int,
    # ... 其他参数
}
```

#### 2. RunPod Endpoint 端实现

RunPod endpoint 端应该参考 `api_server.py` 的实现，包括：
- 初始化 `llm_handler` 和 `dit_handler`
- 根据 `mode` 调用 `create_sample()` 或 `format_sample()`
- 调用 `generate_music()` 生成音频
- 上传音频到 R2 并返回 URL

---

## 总结

| 核心函数 | 调用位置 | 当前状态 | 说明 |
|---------|---------|---------|------|
| `create_sample()` | RunPod Endpoint 端 | ❌ 未调用 | 需要传递 `mode` 和 `sample_query` |
| `format_sample()` | RunPod Endpoint 端 | ❌ 未调用 | 需要传递 `use_format` 参数 |
| `generate_music()` | RunPod Endpoint 端 | ❌ 未调用 | 需要在 endpoint 端实现 |
| `llm_handler.generate_with_stop_condition()` | `generate_music()` 内部 | ✅ 间接调用 | 通过 `generate_music()` 调用 |
| `dit_handler.generate_music()` | `generate_music()` 内部 | ✅ 间接调用 | 通过 `generate_music()` 调用 |

**结论**：`runpod_music_service.py` 目前只是一个简单的客户端，**不直接调用**这些核心函数。这些函数应该在 **RunPod endpoint 端（服务器端）** 实现和调用。需要确保：
1. 客户端传递完整的参数
2. RunPod endpoint 端正确实现这些函数的调用流程
