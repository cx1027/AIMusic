from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from typing import Callable, Optional

from app.services.ace_step_service import AceStepGenerateParams, AceStepNotInstalledError, generate_wav_bytes


@dataclass
class MusicGenResult:
    wav_bytes: bytes
    bpm: int | None = None


ProgressCb = Callable[[int, str], None]


def _wav_sine(*, seconds: int, sample_rate: int = 44100, freq: float = 220.0) -> bytes:
    """Generate a tiny WAV (PCM16 mono) sine wave for MVP plumbing."""
    n_samples = max(1, int(seconds * sample_rate))
    amp = 0.2
    frames = bytearray()
    for i in range(n_samples):
        t = i / sample_rate
        sample = int(amp * 32767.0 * math.sin(2.0 * math.pi * freq * t))
        frames += struct.pack("<h", sample)

    # WAV header (RIFF)
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(frames)
    riff_size = 36 + data_size

    header = b"RIFF" + struct.pack("<I", riff_size) + b"WAVE"
    fmt = b"fmt " + struct.pack("<IHHIIHH", 16, 1, num_channels, sample_rate, byte_rate, block_align, bits_per_sample)
    data = b"data" + struct.pack("<I", data_size) + frames
    return header + fmt + data


def generate_music(*, prompt: str, lyrics: str | None, duration: int, progress_cb: Optional[ProgressCb] = None) -> MusicGenResult:
    """
    Generate music audio as WAV bytes.

    Preference order:
    1) ACE-Step 1.5 local inference (when deps + weights are installed)
    2) MVP fallback sine wave (keeps the product runnable without heavy deps)
    """

    try:
        wav = generate_wav_bytes(
            AceStepGenerateParams(prompt=prompt, lyrics=lyrics, duration=duration),
            progress_cb=progress_cb,
        )
        return MusicGenResult(wav_bytes=wav, bpm=None)
    except AceStepNotInstalledError:
        if progress_cb:
            progress_cb(15, "fallback: synth tone (ace-step not available)")
        wav = _wav_sine(seconds=min(max(duration, 1), 60), freq=220.0 if not lyrics else 330.0)
        if progress_cb:
            progress_cb(80, "fallback: finalizing")
        return MusicGenResult(wav_bytes=wav, bpm=120)


