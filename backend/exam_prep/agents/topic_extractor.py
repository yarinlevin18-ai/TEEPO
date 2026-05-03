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
    sections: list[str] = []
    for m in materials:
        title = m.get("title") or m.get("file_id") or "untitled"
        kind = m.get("type", "material")
        content = (m.get("content") or "").strip()
        if content:
            # Cap each excerpt so a long lecture doesn't blow the context window.
            excerpt = content[:6000]
            sections.append(f"--- [{kind}] {title} ---\n{excerpt}")
        else:
            pages = m.get("pages", "?")
            file_id = m.get("file_id", "?")
            sections.append(f"  - [{kind}] {title} ({pages} pages, file_id={file_id})")

    materials_block = "\n\n".join(sections) if sections else "(no materials provided)"
    prompt = (
        f"Course: {course_name}\n"
        f"Exam type: {exam_type}\n"
        f"Materials:\n{materials_block}\n\n"
        "Identify 4-10 distinct topics that should be studied for this exam, based on the actual content. "
        "Use Hebrew titles. estimated_weight: 1=marginal, 5=central. "
        'Return JSON: {"topics":[{"title":"...","estimated_weight":1-5,"source_refs":["file_id or title"]}]}'
    )
    out = call_json(PRACTICE_MODEL, SYSTEM, prompt)
    return out["topics"]
