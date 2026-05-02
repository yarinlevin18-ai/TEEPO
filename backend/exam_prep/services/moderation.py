"""Basic auto-moderation for group content. Spec §3.5.3 + §C.3.

Phase 1 only: simple rule-based flags. Heavy content moderation is deferred to
phase 2. Per-course whitelist is loaded from Supabase to avoid Hebrew false
positives (e.g. "פיצוץ" in a physics course).
"""
from __future__ import annotations

from dataclasses import dataclass

# Conservative phase-1 list. Real implementation should load from a moderated source.
_BLOCKLIST = {
    # placeholder — replace with curated terms before pilot
}

_SPAM_PATTERNS = (
    "http://", "https://bit.ly", "telegram.me",
)


@dataclass
class ModerationResult:
    blocked: bool
    flagged: bool
    reason: str


def check(text: str, course_whitelist: set[str] | None = None) -> ModerationResult:
    lowered = text.lower()
    whitelist = course_whitelist or set()

    for term in _BLOCKLIST:
        if term in whitelist:
            continue
        if term in lowered:
            return ModerationResult(blocked=True, flagged=True, reason=f"blocked term: {term}")

    for pattern in _SPAM_PATTERNS:
        if pattern in lowered:
            return ModerationResult(blocked=False, flagged=True, reason=f"possible spam: {pattern}")

    return ModerationResult(blocked=False, flagged=False, reason="")
