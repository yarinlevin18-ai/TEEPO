"""Past-exam PDF → structured questions. Spec §3.4.1 + §C.3."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import pdf_extractor

# Hebrew/English question delimiters seen in Israeli university exams.
QUESTION_RE = re.compile(
    r"(?m)^\s*(?:שאלה\s+(\d+)|Question\s+(\d+)|[֐-ת]\s*[.)]\s)"
)


@dataclass
class ParsedQuestion:
    number: int
    text: str
    page: int


@dataclass
class ParsedExam:
    questions: list[ParsedQuestion] = field(default_factory=list)
    low_confidence_pages: list[int] = field(default_factory=list)
    via_ocr: bool = False


def parse(pdf_bytes: bytes) -> dict[str, Any]:
    pages = pdf_extractor.extract(pdf_bytes)
    full = "\n".join(p.text for p in pages)
    via_ocr = any(p.via_ocr for p in pages)
    low_conf = [p.page for p in pages if p.via_ocr and p.confidence < 0.7]

    parsed = ParsedExam(via_ocr=via_ocr, low_confidence_pages=low_conf)

    matches = list(QUESTION_RE.finditer(full))
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full)
        text = full[m.start():end].strip()
        # Estimate which page this question started on.
        offset = m.start()
        running = 0
        page_no = 1
        for p in pages:
            running += len(p.text) + 1
            if offset <= running:
                page_no = p.page
                break
        parsed.questions.append(ParsedQuestion(number=i + 1, text=text, page=page_no))

    return {
        "questions": [{"number": q.number, "text": q.text, "page": q.page} for q in parsed.questions],
        "via_ocr": parsed.via_ocr,
        "low_confidence_pages": parsed.low_confidence_pages,
        "needs_manual_review": len(parsed.questions) == 0 or bool(low_conf),
    }
