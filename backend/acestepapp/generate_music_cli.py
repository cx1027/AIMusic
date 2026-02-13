#!/usr/bin/env python3
"""
Minimal script to initialize ACE-Step and generate music from the terminal.
Run from project root: python generate_music_cli.py

Optional env vars:
  ACESTEP_PROJECT_ROOT   Project root (default: script dir)
  ACESTEP_CONFIG_PATH     DiT config name (default: acestep-v15-turbo)
  ACESTEP_DEVICE          Device: auto, cuda, cpu (default: auto)
  ACESTEP_LM_MODEL_PATH   LLM model name (default: acestep-5Hz-lm-0.6B)
  ACESTEP_LM_BACKEND      vllm or pt (default: vllm)
  ACESTEP_SAVE_DIR        Output directory (default: output/)
"""

import os
import sys

# Project root = directory containing acestep/ and checkpoints/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = SCRIPT_DIR

# Optional: load .env for ACESTEP_* vars
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
except ImportError:
    pass

# Ensure project root is on path for acestep imports
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import (
    GenerationParams,
    GenerationConfig,
    generate_music,
)


def main():
    project_root = os.getenv("ACESTEP_PROJECT_ROOT", PROJECT_ROOT)
    checkpoint_dir = os.path.join(project_root, "checkpoints")
    config_path = os.getenv("ACESTEP_CONFIG_PATH", "acestep-v15-turbo")
    device = os.getenv("ACESTEP_DEVICE", "auto")
    save_dir = os.getenv("ACESTEP_SAVE_DIR", os.path.join(project_root, "output"))
    os.makedirs(save_dir, exist_ok=True)

    # 1) Initialize DiT (required)
    print("Initializing DiT...")
    dit_handler = AceStepHandler()
    status_dit, ok_dit = dit_handler.initialize_service(
        project_root=project_root,
        config_path=config_path,
        device=device,
        use_flash_attention=True,
        compile_model=False,
    )
    if not ok_dit:
        print(f"DiT init failed: {status_dit}")
        sys.exit(1)
    print("DiT ready.")

    # 2) Initialize LLM (optional; needed for thinking/CoT)
    llm_handler = LLMHandler()
    lm_model = os.getenv("ACESTEP_LM_MODEL_PATH", "acestep-5Hz-lm-0.6B")
    lm_backend = os.getenv("ACESTEP_LM_BACKEND", "vllm")
    status_llm, ok_llm = llm_handler.initialize(
        checkpoint_dir=checkpoint_dir,
        lm_model_path=lm_model,
        backend=lm_backend,
        device=device,
    )
    if ok_llm:
        print("LLM ready.")
    else:
        print(f"LLM init failed (optional): {status_llm}")

    # 3) Build params and config
    params = GenerationParams(
        task_type="text2music",
        caption="Upbeat pop rock with electric guitar and drums, catchy chorus.",
        lyrics="",
        instrumental=False,
        vocal_language="en",
        bpm=None,
        keyscale="",
        timesignature="",
        duration=-1.0,
        inference_steps=8,
        seed=42,
        thinking=ok_llm,
        use_cot_metas=ok_llm,
        use_cot_caption=True,
        use_cot_language=True,
    )
    config = GenerationConfig(
        batch_size=1,
        use_random_seed=False,
        seeds=[42],
        audio_format="mp3",
    )

    # 4) Generate
    print("Generating music...")
    result = generate_music(
        dit_handler=dit_handler,
        llm_handler=llm_handler,
        params=params,
        config=config,
        save_dir=save_dir,
    )

    if not result.success:
        print(f"Generation failed: {result.error}")
        sys.exit(1)

    print("Done. Output(s):")
    for a in result.audios:
        path = a.get("path") or ""
        if path:
            print(f"  {path}")


if __name__ == "__main__":
    main()
