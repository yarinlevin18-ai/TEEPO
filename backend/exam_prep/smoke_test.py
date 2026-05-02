"""Smoke test for /exam routes — hits each endpoint with minimal valid payloads.

Run: python -m exam_prep.smoke_test  (from backend/)

Expects Flask to be running on http://localhost:5000. The first call to any
Claude-backed endpoint will fail with 401/500 if ANTHROPIC_API_KEY is unset —
that's the expected failure mode. The point of this script is to confirm the
routes are wired and reachable.
"""
from __future__ import annotations

import json
import sys
from urllib import error, request

BASE = "http://localhost:5000/exam"


def _post(path: str, body: dict) -> tuple[int, str]:
    data = json.dumps(body).encode("utf-8")
    req = request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", errors="replace")[:500]
    except error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")[:500]
    except Exception as e:
        return 0, f"connection error: {e}"


def main() -> int:
    cases = [
        (
            "/plan/topics",
            {
                "course_name": "אלגוריתמים",
                "exam_type": "midterm",
                "materials": [
                    {"type": "lecture", "title": "מבוא", "file_id": "f1", "pages": 30}
                ],
            },
        ),
        (
            "/plan/build",
            {
                "days_available": 14,
                "daily_minutes": 90,
                "available_days": ["Sun", "Mon", "Tue", "Wed", "Thu"],
                "topics": [
                    {"id": "t1", "title": "DFS", "rating": 3},
                    {"id": "t2", "title": "DP", "rating": 2},
                ],
            },
        ),
        (
            "/practice/generate",
            {
                "type": "mcq",
                "topic": "DFS",
                "sources": [{"file_id": "f1"}],
                "n": 3,
                "difficulty": "medium",
            },
        ),
        (
            "/practice/evaluate",
            {
                "question": "הסבר DFS",
                "reference_answer": "עומק לפני רוחב, מחסנית",
                "course_snippets": [],
                "student_answer": "DFS עובד עם מחסנית וחוקר לעומק לפני רוחב",
            },
        ),
    ]

    print(f"Smoke-testing {BASE}\n")
    fail = 0
    for path, body in cases:
        status, snippet = _post(path, body)
        ok = 200 <= status < 300
        marker = "OK " if ok else "FAIL"
        print(f"{marker}  POST {path:24s}  {status}  {snippet[:120]}")
        if not ok:
            fail += 1

    print(f"\n{len(cases) - fail}/{len(cases)} endpoints responded successfully.")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
