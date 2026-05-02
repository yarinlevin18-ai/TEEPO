"""MCQ / open / flashcard generators. Spec §A.3."""
from __future__ import annotations

from typing import Any

from ._claude import PRACTICE_MODEL, call_json

MCQ_SYSTEM = (
    "Generate Hebrew multiple-choice questions from the provided source materials. "
    "Distractors must be plausible. Distribute correct answers across labels (א/ב/ג/ד), "
    "not always the first one. Cite the source file and page for every question."
)

OPEN_SYSTEM = (
    "Generate Hebrew open-ended questions from the provided source materials. "
    "Vary difficulty as requested. Each question must reference a source file/page."
)

FLASHCARD_SYSTEM = (
    "Generate Hebrew flashcards from the provided source materials. "
    "Front = concept or short question, Back = definition or short answer. Avoid trivial duplicates."
)


def generate_mcq(topic: str, sources: list[dict[str, Any]], n: int = 8, difficulty: str = "medium") -> dict[str, Any]:
    prompt = (
        f"Topic: {topic}\nDifficulty: {difficulty}\nN: {n}\n"
        f"Sources: {sources}\n\n"
        'Return JSON: {"questions":[{"content":"...","options":[{"label":"א|ב|ג|ד","text":"...",'
        '"is_correct":bool,"explanation":"..."}],"source_ref":"file_id, page_n","topic_id":"..."}]}'
    )
    return call_json(PRACTICE_MODEL, MCQ_SYSTEM, prompt, max_tokens=6144)


def generate_open(topic: str, sources: list[dict[str, Any]], n: int = 4, difficulty: str = "medium") -> dict[str, Any]:
    prompt = (
        f"Topic: {topic}\nDifficulty: {difficulty}\nN: {n}\n"
        f"Sources: {sources}\n\n"
        'Return JSON: {"questions":[{"content":"...","reference_answer":"...",'
        '"key_points":["..."],"source_ref":"file_id, page_n"}]}'
    )
    return call_json(PRACTICE_MODEL, OPEN_SYSTEM, prompt, max_tokens=4096)


def generate_flashcards(topic: str, sources: list[dict[str, Any]], n: int = 20) -> dict[str, Any]:
    prompt = (
        f"Topic: {topic}\nN: {n}\nSources: {sources}\n\n"
        'Return JSON: {"flashcards":[{"front":"...","back":"...","source_ref":"file_id, page_n"}]}'
    )
    return call_json(PRACTICE_MODEL, FLASHCARD_SYSTEM, prompt, max_tokens=4096)
