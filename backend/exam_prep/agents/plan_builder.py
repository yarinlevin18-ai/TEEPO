"""Daily study plan builder. Spec §A.2."""
from __future__ import annotations

from typing import Any

from ._claude import PRACTICE_MODEL, call_json

SYSTEM = (
    "You build daily study plans for exams. Respect the student's calendar conflicts and "
    "their self-rating per topic (1=unfamiliar..5=mastered). Last 7 days emphasize review + "
    "2 simulations. Output Hebrew instructions. Return strict JSON only."
)


def build(
    days_available: int,
    daily_minutes: int,
    available_days_of_week: list[str],
    topics_with_ratings: list[dict[str, Any]],
    calendar_conflicts: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = (
        f"Days available: {days_available}\n"
        f"Daily minutes: {daily_minutes}\n"
        f"Available days of week: {','.join(available_days_of_week)}\n"
        f"Topics: {topics_with_ratings}\n"
        f"Calendar conflicts: {calendar_conflicts}\n\n"
        'Return JSON: {"days":[{"date":"YYYY-MM-DD","activities":['
        '{"type":"read|practice|flashcards|simulation|review","topic_id":"...",'
        '"minutes":int,"instruction":"Hebrew text"}]}]}'
    )
    return call_json(PRACTICE_MODEL, SYSTEM, prompt, max_tokens=8192)
