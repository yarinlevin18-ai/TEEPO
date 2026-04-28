"""TAU portal scraper.

The TAU student portal lives at www.ims.tau.ac.il (course registration,
grades, schedule). It is not Moodle — that's a separate Moodle 4.x install
at moodle.tau.ac.il, handled by services/moodle_scraper.py. This module is
specifically for the IMS portal: grade history, schedule, transcript.

Auth: shares the cookie store key 'portal' with the BGU portal scraper. A
deployment serving multiple universities at once will need a per-school
key (out of scope here — the registry in university_selectors.py is where
that lives).

Open items (require a real TAU account to verify):
- The exact path layout of the IMS portal (mostly JSP pages — paths likely
  end in .jsp under various app contexts). Discovery should find them
  reliably; if not, add a school-specific fallback list below.
- Localized column headers in the grades table — TAU may use slightly
  different Hebrew labels than BGU (e.g. "ציון סופי" vs "ציון"). The
  parse function already accepts a broad keyword list; extend if needed.
"""
import re
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from config import logger, PORTAL_URL
from services import moodle_scraper as _bgu  # cookie + session helpers
from services.moodle_scraper import _build_session, _load_cookies_from_store, parse_portal_html


# ── Discovery configuration ────────────────────────────────────────────────
# Entry points to start crawling. TAU IMS uses a JSP front controller, so
# the home/login page is the realistic seed. Fallback to '/' if env var
# isn't set to a deeper path.
_TAU_ENTRY_PATHS = (
    "/",
    "/yedion/fireflyweb.aspx",   # legacy IMS front
    "/yedionweb/login.aspx",     # newer IMS login
)

# Keywords that flag a link as grade-related, scored by overlap. Mirrors
# the BGU set with TAU phrasings added.
_GRADE_KEYWORDS = [
    ["ציונים", "ציון", "תעודה", "גיליון", "דו\"ח לימודים", "תיעוד"],
    ["grades", "transcript", "academic record", "report"],
]

_SCHEDULE_KEYWORDS = [
    ["מערכת שעות", "מערכת", "לוח שיעורים"],
    ["schedule", "timetable", "calendar"],
]

# Crawl bounds — match the BGU portal scraper so we don't surprise the
# portal with a heavier load.
_DISCOVERY_MAX_PAGES = 12
_DISCOVERY_TIMEOUT = 8

# Skip patterns — anything that'd kill the session or wander off-portal.
_DISCOVERY_SKIP = (
    "logout", "signoff", "signout", "exit", "logoff",
    "javascript:", "mailto:", "tel:",
)


def _score_link(text: str, href: str, keyword_groups: list[list[str]]) -> int:
    blob = f"{text} {href}".lower()
    return sum(1 for group in keyword_groups for kw in group if kw.lower() in blob)


def _discover_paths(
    session: requests.Session,
    keyword_groups: list[list[str]],
) -> list[str]:
    """Return absolute URLs ranked by relevance to the keyword groups.
    Same shape and behaviour as the BGU discovery in moodle_scraper —
    intentionally duplicated so this module stays self-contained.
    """
    if not PORTAL_URL:
        return []

    portal_host = urlparse(PORTAL_URL).netloc.lower()
    visited: set[str] = set()
    scored: dict[str, int] = {}
    queue: list[tuple[str, int]] = [
        (f"{PORTAL_URL}{p}", 0) for p in _TAU_ENTRY_PATHS
    ]

    pages_fetched = 0
    while queue and pages_fetched < _DISCOVERY_MAX_PAGES:
        url, depth = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)

        try:
            resp = session.get(url, timeout=_DISCOVERY_TIMEOUT)
        except Exception:
            continue
        pages_fetched += 1
        if resp.status_code != 200 or len(resp.text) < 200:
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith("#"):
                continue
            blob_lower = href.lower()
            if any(skip in blob_lower for skip in _DISCOVERY_SKIP):
                continue

            absolute = urljoin(url, href)
            parsed = urlparse(absolute)
            if parsed.netloc and parsed.netloc.lower() != portal_host:
                continue

            text = a.get_text(strip=True)
            score = _score_link(text, href, keyword_groups)
            if score > 0:
                prior = scored.get(absolute, -1)
                if score > prior:
                    scored[absolute] = score
            if depth < 1 and absolute not in visited:
                queue.append((absolute, depth + 1))

    return [
        url for url, _score in sorted(
            scored.items(), key=lambda kv: (-kv[1], kv[0])
        )
    ]


# ── Public surface ─────────────────────────────────────────────────────────

def scrape_grades() -> dict:
    """Return TAU IMS grades.

    Shape matches the BGU scraper: {status, grades: [...], grades_found}.
    Each grade is {course_name, grade, grade_text, semester?, academic_year?,
    credits?, course_id?, source: "portal"}.
    """
    cookies = _load_cookies_from_store("portal")
    if not cookies:
        return {"status": "error", "message": "לא מחובר לפורטל TAU. אנא התחבר תחילה."}

    session = _build_session(cookies)
    candidates = _discover_paths(session, _GRADE_KEYWORDS)

    if candidates:
        logger.debug(f"[TAU] portal grade discovery: {len(candidates)} candidates (top: {candidates[:3]})")
    else:
        logger.debug("[TAU] portal grade discovery: 0 candidates")

    for url in candidates:
        try:
            resp = session.get(url, timeout=15)
        except Exception as e:
            logger.debug(f"[TAU] grade page fetch failed for {url}: {e}")
            continue
        if resp.status_code != 200 or len(resp.text) < 200:
            continue

        # parse_portal_html is generic — header keywords cover Hebrew
        # variants TAU uses too. If TAU diverges, extend the keyword
        # lists in moodle_scraper.parse_portal_html or copy the
        # function here with TAU-specific tweaks.
        parsed = parse_portal_html(resp.text, url=url, title="")
        if parsed.get("grades"):
            grades = parsed["grades"]
            logger.debug(f"[TAU] parsed {len(grades)} grades from {url}")
            return {
                "status": "success",
                "grades": grades,
                "grades_found": len(grades),
            }

    return {
        "status": "partial",
        "message": "פורטל TAU נטען אך לא נמצאו טבלאות ציונים בעמודים שסרקנו.",
        "grades": [],
        "grades_found": 0,
    }


def scrape_schedule() -> dict:
    """Return TAU IMS schedule. Best-effort — returns the first table
    that looks like a timetable on a discovered page.

    Shape: {status, schedule: [[cell, cell, ...], ...]} where each row is
    the raw cells of a parsed HTML table. The frontend is responsible for
    mapping cells to days/hours.
    """
    cookies = _load_cookies_from_store("portal")
    if not cookies:
        return {"status": "error", "message": "לא מחובר לפורטל TAU. אנא התחבר תחילה."}

    session = _build_session(cookies)
    candidates = _discover_paths(session, _SCHEDULE_KEYWORDS)

    if candidates:
        logger.debug(f"[TAU] portal schedule discovery: {len(candidates)} candidates (top: {candidates[:3]})")

    for url in candidates:
        try:
            resp = session.get(url, timeout=15)
        except Exception:
            continue
        if resp.status_code != 200 or len(resp.text) < 500:
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        tables = soup.find_all("table")
        schedule: list[list[str]] = []
        for table in tables:
            rows = table.find_all("tr")
            for row in rows[1:]:
                cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                if len(cells) >= 3 and any(cells):
                    schedule.append(cells)
        if schedule:
            return {"status": "success", "schedule": schedule}

    return {"status": "partial", "message": "פורטל TAU נטען אך לא נמצאה מערכת שעות."}
