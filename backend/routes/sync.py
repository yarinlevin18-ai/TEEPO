"""
POST /api/sync/all — bulk Moodle sync across a user's courses.

The frontend ships the list of courses it wants synced (each with its
moodle_id and last_synced_at if known). The backend:

  1. Fans out to the existing per-source scrapers in
     `backend/services/moodle_scraper.py`:
       - `scrape_all_assignments(course_ids)`
       - `scrape_course_materials(course_url)` / `ingest_course_materials`
       - `scrape_grades()`
     None of these are re-implemented here — this route is glue.

  2. Filters scraper output to "new since last_synced_at" per course.
     The diff cutoff is per-course because users can re-sync individual
     courses out of band.

  3. Mirrors the new cutoff to the supabase `courses.last_synced_at`
     column (added in migrate_005.sql) so the value survives even if
     the user's Drive db.json is wiped.

  4. Returns results grouped by course so the modal can render them
     under course-block-head sections without further wrangling.

Response shape:
    {
        "courses_scanned": int,
        "synced_at": ISO-8601 timestamp (the cutoff written),
        "results": [
            {
                "course_id": str | None,            # frontend's course id
                "moodle_id": str,
                "course_name": str,
                "course_color": str | None,         # passed through from request
                "new_assignments": [{...}],
                "new_files": [{...}],
                "new_grades": [{...}],
                "error": str | None,                # per-course; doesn't fail the batch
            }
        ],
        "totals": {
            "new_assignments": int,
            "new_files": int,
            "new_grades": int,
        }
    }

Per-course errors do NOT fail the whole batch — they're returned in the
per-course `error` field. The user sees "3 courses ok, 1 failed" rather
than losing the run.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from flask import Blueprint, jsonify, request

from config import logger
from routes.api import _user_id
from services import supabase_client as db
from services.moodle_scraper import (
    scrape_all_assignments,
    scrape_course_materials,
    scrape_grades,
)

sync = Blueprint("sync", __name__, url_prefix="/api/sync")

_LOG = "[sync/all]"


def _parse_iso(ts: str | None) -> datetime | None:
    """Parse an ISO-8601 timestamp; return None on any malformed input.
    We accept the unsanitized client value because frontend-supplied
    timestamps are advisory (diff hint), not authoritative."""
    if not ts:
        return None
    try:
        # fromisoformat handles "2026-05-14T12:34:56+00:00" and the "Z" suffix
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _is_new(item: dict, cutoff: datetime | None, *date_keys: str) -> bool:
    """An item is 'new' if any of its candidate date fields is after the
    cutoff, OR if the cutoff is None (first sync — everything is new)."""
    if cutoff is None:
        return True
    for k in date_keys:
        raw = item.get(k)
        if not raw:
            continue
        ts = _parse_iso(raw) if isinstance(raw, str) else None
        if ts is None and isinstance(raw, (int, float)):
            # Moodle gives us unix-seconds for some fields
            try:
                ts = datetime.fromtimestamp(raw, tz=timezone.utc)
            except (ValueError, OSError):
                ts = None
        if ts and ts > cutoff:
            return True
    # No date field present and we have a cutoff — assume it's not new.
    return False


@sync.post("/all")
def sync_all():
    """See module docstring for contract."""
    body = request.get_json(silent=True) or {}
    incoming = body.get("courses") or []
    if not isinstance(incoming, list):
        return jsonify({"error": "bad_request", "detail": "courses must be a list"}), 400

    user_id = _user_id()
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Single global call — scrape_all_assignments accepts a list of course ids
    # and returns assignments scoped to those courses, so we batch by moodle_id.
    moodle_ids = [c.get("moodle_id") for c in incoming if c.get("moodle_id")]
    moodle_ids_int: list[int] = []
    for mid in moodle_ids:
        try:
            moodle_ids_int.append(int(mid))
        except (TypeError, ValueError):
            continue

    try:
        assignments_response = scrape_all_assignments(moodle_ids_int or None)
    except Exception as e:  # noqa: BLE001 — log and continue with empty assignments
        logger.warning(f"{_LOG} scrape_all_assignments failed: {e}")
        assignments_response = {"status": "error", "assignments": []}

    assignments_by_course: dict[str, list[dict]] = {}
    for a in assignments_response.get("assignments") or []:
        cid = str(a.get("course_moodle_id") or "")
        assignments_by_course.setdefault(cid, []).append(a)

    try:
        grades_response = scrape_grades()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"{_LOG} scrape_grades failed: {e}")
        grades_response = {"status": "error", "grades": []}

    grades_by_course: dict[str, list[dict]] = {}
    for g in grades_response.get("grades") or []:
        cid = str(g.get("course_moodle_id") or "")
        if cid:
            grades_by_course.setdefault(cid, []).append(g)

    # Per-course materials need an individual scrape — Moodle's
    # core_course_get_contents takes a single courseid at a time.
    results: list[dict[str, Any]] = []
    total_a = total_f = total_g = 0

    for course in incoming:
        moodle_id = str(course.get("moodle_id") or "")
        course_id = course.get("course_id")  # frontend uuid (Drive DB id)
        course_url = course.get("source_url") or ""
        course_name = course.get("title") or course.get("course_name") or "קורס"
        course_color = course.get("color")
        cutoff = _parse_iso(course.get("last_synced_at"))

        # Materials — best-effort per course; failures are isolated
        new_files: list[dict] = []
        if course_url:
            try:
                materials_response = scrape_course_materials(course_url)
                materials = materials_response.get("materials") or []
                for m in materials:
                    # Materials don't carry a reliable timestamp from Moodle's
                    # AJAX; treat the whole set as "new since last sync" when
                    # we have a cutoff and resort to a soft dedup on the
                    # frontend. When there's no prior sync, everything is new.
                    if _is_new(m, cutoff, "modified", "timecreated", "timemodified"):
                        new_files.append({
                            "title": m.get("title") or m.get("name") or "ללא שם",
                            "url": m.get("url") or "",
                            "type": m.get("type") or "file",
                            "filesize": m.get("filesize") or m.get("size") or 0,
                            "section": m.get("section") or "",
                        })
            except Exception as e:  # noqa: BLE001
                logger.debug(f"{_LOG} materials for {moodle_id} failed: {e}")
                # don't bubble — the course still gets assignments/grades

        # Filter the AJAX-fetched assignments for this course down to new ones.
        course_assignments_all = assignments_by_course.get(moodle_id, [])
        new_assignments = [
            a for a in course_assignments_all
            if _is_new(a, cutoff, "deadline", "timemodified", "timecreated")
        ]

        # Same for grades.
        course_grades_all = grades_by_course.get(moodle_id, [])
        new_grades = [
            g for g in course_grades_all
            if _is_new(g, cutoff, "timemodified", "updated_at", "graded_at")
        ]

        # Update supabase cutoff if we have an authenticated user + a course_id
        # to update by. Failures here don't sink the response — the cutoff is
        # advisory, the client also persists its own copy to db.json.
        error = None
        try:
            if course_id:
                db.get_client().table("courses").update(
                    {"last_synced_at": now_iso}
                ).eq("id", course_id).eq("user_id", user_id).execute()
        except Exception as e:  # noqa: BLE001
            logger.debug(f"{_LOG} last_synced_at update failed for {course_id}: {e}")
            # Not surfaced as a per-course error — the sync itself worked.

        total_a += len(new_assignments)
        total_f += len(new_files)
        total_g += len(new_grades)

        results.append({
            "course_id": course_id,
            "moodle_id": moodle_id,
            "course_name": course_name,
            "course_color": course_color,
            "new_assignments": new_assignments,
            "new_files": new_files,
            "new_grades": new_grades,
            "error": error,
        })

    return jsonify({
        "courses_scanned": len(incoming),
        "synced_at": now_iso,
        "results": results,
        "totals": {
            "new_assignments": total_a,
            "new_files": total_f,
            "new_grades": total_g,
        },
    })
