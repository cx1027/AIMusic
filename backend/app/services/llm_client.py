"""LLM client for music generation input expansion (sample_query mode)."""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# System prompt for expanding user queries into music generation inputs
SYSTEM_PROMPT = """You are an expert music composer and lyricist. Given a user's natural-language description of desired music, you will generate detailed, structured inputs for an AI music generation system (ACE-Step 1.5).

Your task:
1. Expand the user's description into a vivid, detailed music caption (max 512 chars).
2. Write original lyrics with proper section markers (max 4096 chars).
3. Suggest appropriate musical metadata (BPM, key, duration).

Output ONLY valid JSON with these fields:
- "caption": Detailed music description (1-2 sentences, vivid and specific, e.g., "A soaring indie pop anthem with shimmering guitars, driving drums, and an emotionally charged vocal melody...")
- "lyrics": Original lyrics with section markers (e.g., "[Verse 1]\\nLine one...\\n[Pre-Chorus]\\n..."). Use markers: [Intro], [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro], [Instrumental], [Solo], [Interlude], [Outro]. Leave empty string "" if the user wants instrumental.
- "bpm": Integer BPM (60-200 range, or null for auto). Common: Pop 110-130, Rock 120-140, Ballad 70-90, EDM 125-150.
- "key_scale": String like "C major", "A minor", "G major", or "" for auto.
- "duration": Integer seconds (30-300), or null for auto.
- "reasoning": Brief reasoning for your choices (1 sentence, for internal use only).

IMPORTANT:
- If the user explicitly says "instrumental" or "no lyrics", set lyrics to "".
- Lyrics must be original. Do not quote existing songs.
- Return ONLY the JSON object. No markdown fences, no explanation.
"""


@dataclass
class SampleQueryResult:
    """Result from expanding a sample_query via LLM."""
    caption: str
    lyrics: str
    bpm: Optional[int]
    key_scale: str
    duration: Optional[int]
    reasoning: str

    @property
    def success(self) -> bool:
        return bool(self.caption)


class LlmClientError(RuntimeError):
    """Raised when LLM API call fails."""
    pass


def _get_anthropic_api_key() -> str:
    """Get Anthropic API key from backend/.env or environment."""
    env_path = Path(__file__).parent.parent.parent / ".env"
    try:
        from dotenv import dotenv_values
        env_vars = dotenv_values(env_path)
        key = env_vars.get("ANTHROPIC_API_KEY", "") or os.getenv("ANTHROPIC_API_KEY", "")
    except Exception:
        key = os.getenv("ANTHROPIC_API_KEY", "")

    if not key:
        raise LlmClientError(
            "ANTHROPIC_API_KEY is required for sample_query mode.\n"
            "Set ANTHROPIC_API_KEY in your backend/.env file.\n"
            "Get your key from: https://console.anthropic.com/settings/keys"
        )
    return key


def _parse_llm_json_output(raw_text: str) -> dict:
    """Extract JSON object from LLM response text."""
    # Try to find JSON object in the response
    text = raw_text.strip()

    # Try direct JSON parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to extract from markdown code blocks
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find any {...} block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as e:
            raise LlmClientError(f"Could not parse LLM JSON output: {e}\nResponse: {text[:500]}")

    raise LlmClientError(f"Could not find JSON in LLM response: {text[:500]}")


def expand_sample_query(
    sample_query: str,
    *,
    progress_cb: Optional[callable] = None,
) -> SampleQueryResult:
    """
    Expand a natural-language sample_query into detailed music generation inputs
    using Claude (Anthropic) LLM.

    Args:
        sample_query: User's natural language description (e.g., "Upbeat summer pop song about adventure")
        progress_cb: Optional callback for progress reporting.

    Returns:
        SampleQueryResult with caption, lyrics, bpm, key_scale, duration, reasoning.
    """
    if not sample_query or not sample_query.strip():
        raise LlmClientError("sample_query cannot be empty")

    api_key = _get_anthropic_api_key()

    if progress_cb:
        progress_cb(1, "llm: preparing request")

    user_message = f"Generate music inputs for this description:\n\n\"{sample_query.strip()}\""

    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        "messages": [
            {"role": "user", "content": user_message}
        ],
    }

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    if progress_cb:
        progress_cb(2, "llm: calling Claude API")

    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                "https://api.anthropic.com/v1/messages",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise LlmClientError(f"Anthropic API call failed: {e}") from e
    except Exception as e:
        raise LlmClientError(f"LLM request failed: {type(e).__name__}: {e}") from e

    if progress_cb:
        progress_cb(4, "llm: parsing response")

    # Extract content from Anthropic response format
    content_blocks = data.get("content", [])
    if not content_blocks:
        raise LlmClientError(f"Empty response from Anthropic: {data}")

    raw_text = ""
    for block in content_blocks:
        if block.get("type") == "text":
            raw_text = block.get("text", "")
            break

    if not raw_text:
        raise LlmClientError(f"No text content in Anthropic response: {content_blocks}")

    logger.info(f"[llm_client] Raw LLM response: {raw_text[:200]}...")

    # Parse JSON from response
    parsed = _parse_llm_json_output(raw_text)

    caption = str(parsed.get("caption", "")).strip()
    lyrics = str(parsed.get("lyrics", "")).strip()
    bpm = parsed.get("bpm")
    if bpm is not None:
        try:
            bpm = int(bpm)
            if not (30 <= bpm <= 300):
                bpm = None
        except (TypeError, ValueError):
            bpm = None
    key_scale = str(parsed.get("key_scale", "")).strip()
    duration = parsed.get("duration")
    if duration is not None:
        try:
            duration = int(duration)
            if not (10 <= duration <= 600):
                duration = None
        except (TypeError, ValueError):
            duration = None
    reasoning = str(parsed.get("reasoning", "")).strip()

    if not caption:
        raise LlmClientError(f"LLM did not return a caption. Response: {parsed}")

    if progress_cb:
        progress_cb(5, "llm: expansion complete")

    logger.info(
        f"[llm_client] Expansion result: caption='{caption[:80]}...', "
        f"lyrics={'present' if lyrics else 'empty'}, bpm={bpm}, "
        f"key={key_scale}, duration={duration}"
    )

    return SampleQueryResult(
        caption=caption,
        lyrics=lyrics,
        bpm=bpm,
        key_scale=key_scale,
        duration=duration,
        reasoning=reasoning,
    )
