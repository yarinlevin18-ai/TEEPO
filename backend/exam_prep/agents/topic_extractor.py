"""Topic extraction agent. Spec §A.1."""
from __future__ import annotations

from typing import Any, TypedDict

from ._claude import PRACTICE_MODEL, call_json


class Topic(TypedDict):
    title: str
    estimated_weight: int
    source_refs: list[str]


SYSTEM = (
    "You are analyzing course materials for an Israeli university student preparing for an exam. "
    "Extract a clean, deduplicated list of major topics covered in the materials. "
    "Output Hebrew titles. Return strict JSON only."
)


def extract(course_name: str, exam_type: str, materials: list[dict[str, Any]]) -> list[Topic]:
    materials_summary = "\n".join(
        f"  - [{m['type']}] {m['title']} ({m.get('pages', '?')} pages, file_id={m['file_id']})"
        for m in materials
    )
    prompt = (
        f"Course: {course_name}\n"
        f"Exam type: {exam_type}\n"
        f"Materials:\n{materials_summary}\n\n"
        'Return JSON: {"topics":[{"title":"...","estimated_weight":1-5,"source_refs":["file_id"]}]}'
    )
    out = call_json(PRACTICE_MODEL, SYSTEM, prompt)
    return out["topics"]
