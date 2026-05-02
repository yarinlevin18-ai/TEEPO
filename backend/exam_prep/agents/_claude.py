"""Shared Claude client. Differential model selection per spec §C.3."""
from __future__ import annotations

import json
import os
from typing import Any

from anthropic import Anthropic

_client: Anthropic | None = None


def client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


PRACTICE_MODEL = os.environ.get("ANTHROPIC_MODEL_FOR_PRACTICE", "claude-sonnet-4-6")
ANALYSIS_MODEL = os.environ.get("ANTHROPIC_MODEL_FOR_ANALYSIS", "claude-opus-4-7")


def call_json(model: str, system: str, prompt: str, max_tokens: int = 4096) -> dict[str, Any]:
    """Single-shot Claude call expecting strict JSON output. Raises on parse failure."""
    msg = client().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    return json.loads(text.strip())
