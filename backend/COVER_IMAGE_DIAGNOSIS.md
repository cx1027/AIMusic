# Cover Image Generation - 诊断指南

## 问题描述
前端显示 "Cover image not available"，后端没有相关日志。

## 可能的原因

### 1. 任务没有执行到封面图片生成步骤 ⚠️ **最可能**

**症状**：后端没有任何 `[music_generation]` 相关的日志

**原因**：
- 任务在音乐生成阶段就失败了
- BackgroundTasks 没有正确执行
- 任务执行了但日志没有输出

**检查方法**：
1. 查看后端完整日志，搜索：
   - `[generate]` - 查看任务是否被创建
   - `[music_generation]` - 查看任务是否执行
   - `FUNCTION ENTRY` - 查看函数是否被调用
   - `STARTING COVER IMAGE GENERATION` - 查看是否到达封面图片生成步骤

2. 检查任务状态：
   - 前端应该显示任务进度
   - 如果任务在 60% 之前失败，说明没有到达封面图片生成步骤

### 2. 环境变量没有正确加载

**检查方法**：
```bash
cd backend
python test_cover_image_generation.py
```

这个脚本会：
- 检查环境变量
- 测试封面图片生成
- 显示详细的错误信息

### 3. BackgroundTasks 执行失败但错误被吞掉

**原因**：BackgroundTasks 中的异常可能没有被正确记录

**检查方法**：
1. 查看 FastAPI 的错误日志
2. 检查是否有未捕获的异常

## 诊断步骤

### 步骤 1: 运行诊断脚本

```bash
cd backend
source .venv/bin/activate
python test_cover_image_generation.py
```

**预期输出**：
- ✅ 如果成功：显示 "All tests passed!"
- ❌ 如果失败：显示具体的错误信息

### 步骤 2: 检查后端日志

启动后端服务，然后生成一首音乐，查看日志：

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

**应该看到的日志**：
```
[generate] FLUXSCHNELL env var: 'RUNPOD'
[generate] Using BackgroundTasks (RUNPOD mode) for task_id=...
[generate] Background task added successfully
[music_generation] FUNCTION ENTRY: run_generation_task called
[music_generation] MUSIC GENERATION TASK STARTED: ...
[music_generation] Audio generation completed, uploading audio...
[music_generation] ========== STARTING COVER IMAGE GENERATION ==========
[music_generation] Starting cover image generation...
[image_gen_service] generate_cover_image called: prompt='...'
```

**如果没有看到这些日志**：
- 任务可能没有执行
- 或者日志输出被重定向了

### 步骤 3: 检查任务进度

在前端生成音乐时，观察进度条：
- 如果进度停在 60% 之前：音乐生成失败
- 如果进度到达 65% 但封面图片没有生成：封面图片生成失败
- 如果进度到达 100% 但封面图片没有显示：可能是前端问题

### 步骤 4: 检查任务结果

查看前端控制台（F12），检查任务结果：
```javascript
// 应该看到类似这样的结果
{
  song_id: "...",
  audio_url: "...",
  cover_image_url: "...",  // 如果有封面图片
  cover_image_error: "..."  // 如果有错误
}
```

## 常见问题

### Q1: 为什么没有看到 `[music_generation]` 日志？

**A**: 可能的原因：
1. **任务没有执行**：检查 `[generate]` 日志，确认任务是否被创建
2. **日志被重定向**：检查日志输出位置
3. **任务在早期失败**：查看是否有错误日志

**解决方法**：
- 确保后端服务正在运行
- 检查日志输出位置
- 查看完整的后端日志

### Q2: 任务执行了但封面图片没有生成？

**A**: 可能的原因：
1. **环境变量没有设置**：运行 `test_cover_image_generation.py` 检查
2. **RunPod 配置错误**：检查 endpoint ID 和 API key
3. **网络问题**：检查是否可以访问 RunPod API

**解决方法**：
- 运行诊断脚本
- 检查 `.env` 文件
- 重启后端服务

### Q3: 前端显示错误消息但后端没有日志？

**A**: 可能的原因：
1. **错误发生在 BackgroundTasks 中**：检查 FastAPI 错误日志
2. **日志输出被缓冲**：确保使用 `flush=True`（已添加）
3. **日志级别设置**：检查日志配置

**解决方法**：
- 查看 FastAPI 的完整日志输出
- 检查是否有异常堆栈跟踪
- 确认日志级别设置正确

## 快速检查清单

- [ ] 运行 `test_cover_image_generation.py` 测试通过
- [ ] `.env` 文件中配置正确
- [ ] 后端服务已重启（修改配置后）
- [ ] 后端日志显示 `[generate]` 任务创建日志
- [ ] 后端日志显示 `[music_generation]` 任务执行日志
- [ ] 后端日志显示 `STARTING COVER IMAGE GENERATION`
- [ ] 后端日志显示 `[image_gen_service]` 相关日志
- [ ] 前端显示任务进度到达 65%+
- [ ] 前端控制台显示任务结果包含 `cover_image_url` 或 `cover_image_error`

## 如果问题仍然存在

1. **收集完整日志**：
   - 后端完整日志输出
   - 前端控制台日志
   - 网络请求日志（F12 -> Network）

2. **运行诊断脚本**：
   ```bash
   cd backend
   python test_cover_image_generation.py
   ```

3. **检查任务状态**：
   - 查看任务进度
   - 检查任务结果
   - 确认任务是否完成

4. **提供信息**：
   - 诊断脚本的输出
   - 后端日志片段（特别是 `[music_generation]` 和 `[image_gen_service]` 相关）
   - 前端控制台的错误信息
