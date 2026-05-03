"""MCQ / open / flashcard generators. Spec §A.3."""
from __future__ import annotations

from typing import Any

from ._claude import PRACTICE_MODEL, call_json

MCQ_SYSTEM = (
    "Generate Hebrew multiple-choice questions grounded in the provided source materials. "
    "Distractors must be plausible. Distribute correct answers across labels (א/ב/ג/ד), "
    "not always the first one. Cite the source for every question."
)

OPEN_SYSTEM = (
    "Generate Hebrew open-ended questions grounded in the provided source materials. "
    "Vary difficulty as requested. Each question must reference a source."
)

FLASHCARD_SYSTEM = (
    "Generate Hebrew flashcards grounded in the provided source materials. "
    "Front = concept or short question, Back = definition or short answer. Avoid trivial duplicates."
)


def _format_sources(sources: list[dict[str, Any]]) -> str:
    if not sources:
        return "(no sources)"
    blocks: list[str] = []
    for s in sources:
        title = s.get("title") or s.get("file_id") or "source"
        content = (s.get("content") or "").strip()
        if content:
            # Cap each excerpt so a long lecture doesn't blow the context window.
            excerpt = content[:8000]
            blocks.append(f"--- {title} ---\n{excerpt}")
        else:
            blocks.append(f"  - {title} (file_id={s.get('file_id', '?')}, page_n={s.get('pages', '?')})")
    return "\n\n".join(blocks)


def generate_mcq(topic: str, sources: list[dict[str, Any]], n: int = 8, difficulty: str = "medium") -> dict[str, Any]:
    prompt = (
        f"Topic: {topic}\nDifficulty: {difficulty}\nN: {n}\n"
        f"Sources:\n{_format_sources(sources)}\n\n"
        "Generate exactly N high-quality questions in Hebrew. Each must be answerable from the sources. "
        'Return JSON: {"questions":[{"content":"...","options":[{"label":"א|ב|ג|ד","text":"...",'
        '"is_correct":bool,"explanation":"..."}],"source_ref":"short citation","topic_id":"..."}]}'
    )
    return call_json(PRACTICE_MODEL, MCQ_SYSTEM, prompt, max_tokens=6144)


def generate_open(topic: str, sources: list[dict[str, Any]], n: int = 4, difficulty: str = "medium") -> dict[str, Any]:
    prompt = (
        f"Topic: {topic}\nDifficulty: {difficulty}\nN: {n}\n"
        f"Sources:\n{_format_sources(sources)}\n\n"
        "Each question must be answerable from the sources. reference_answer should be the model answer; "
        "key_points should list the core ideas a complete answer must cover. "
        'Return JSON: {"questions":[{"content":"...","reference_answer":"...",'
        '"key_points":["..."],"source_ref":"short citation"}]}'
    )
    return call_json(PRACTICE_MODEL, OPEN_SYSTEM, prompt, max_tokens=4096)


def generate_flashcards(topic: str, sources: list[dict[str, Any]], n: int = 20) -> dict[str, Any]:
    prompt = (
        f"Topic: {topic}\nN: {n}\n"
        f"Sources:\n{_format_sources(sources)}\n\n"
        "Each card must come directly from the sources. Front = a single concept/term/question. "
        "Back = a concise definition or answer (1-2 sentences). "
        'Return JSON: {"flashcards":[{"front":"...","back":"...","source_ref":"short citation"}]}'
    )
    return call_json(PRACTICE_MODEL, FLASHCARD_SYSTEM, prompt, max_tokens=4096)
