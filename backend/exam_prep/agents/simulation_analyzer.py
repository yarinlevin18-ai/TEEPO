"""Whole-simulation analysis. Spec §A.5. Uses Opus for nuance."""
from __future__ import annotations

from typing import Any

from ._claude import ANALYSIS_MODEL, call_json

SYSTEM = (
    "You analyze completed exam simulations. Given per-question verdicts and topic mappings, "
    "produce an estimated score, per-topic correctness percentages, strengths, weaknesses, and "
    "concrete next-day recommendations in Hebrew. Return strict JSON only."
)


def analyze(
    questions_and_answers: list[dict[str, Any]],
    topic_mapping: dict[str, str],
) -> dict[str, Any]:
    prompt = (
        f"Q&A: {questions_and_answers}\n"
        f"Topic mapping: {topic_mapping}\n\n"
        'Return JSON: {"estimated_score":0-100,'
        '"by_topic":[{"topic_id":"...","correct_pct":0-100,"n_questions":int}],'
        '"strengths":["topic_id"],"weaknesses":["topic_id"],'
        '"recommendations":[{"action":"Hebrew","topic_id":"...","minutes":int}]}'
    )
    return call_json(ANALYSIS_MODEL, SYSTEM, prompt, max_tokens=4096)
