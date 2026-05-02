"""Open-answer evaluation. Spec §A.4. Falls back to 'uncertain' below 0.7 confidence."""
from __future__ import annotations

from typing import Any

from ._claude import PRACTICE_MODEL, call_json

SYSTEM = (
    "Evaluate Hebrew open-question answers fairly. Compare against reference answer if provided "
    "and the relevant course material excerpts. Return strict JSON. If you are not at least 70% "
    "confident, set verdict='uncertain' and explain what the human should verify."
)


def evaluate(
    question: str,
    reference_answer: str | None,
    course_snippets: list[str],
    student_answer: str,
) -> dict[str, Any]:
    prompt = (
        f"Question: {question}\n"
        f"Reference answer: {reference_answer or 'none'}\n"
        f"Course materials: {course_snippets}\n"
        f"Student answer: {student_answer}\n\n"
        'Return JSON: {"verdict":"full|partial|insufficient|uncertain",'
        '"reasoning":"Hebrew","missing_points":["..."],"confidence":0.0-1.0}'
    )
    out = call_json(PRACTICE_MODEL, SYSTEM, prompt, max_tokens=1024)
    if out.get("confidence", 0) < 0.7:
        out["verdict"] = "uncertain"
    return out
