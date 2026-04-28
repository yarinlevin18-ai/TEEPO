"""Google Calendar read-only client.

The frontend ships a Google `access_token` (issued by Supabase OAuth and
optionally rotated through `/api/auth/refresh-google`). This module hands
that token to the public Calendar v3 API and returns the parsed events.

We deliberately keep this module read-only — write access (create/update/
delete events) needs additional consent flows and a separate review.
"""
from typing import Optional

import httpx

from config import logger

CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"

# Cap how many events a single call can pull back. Calendar v3 enforces 2500
# server-side; we cap lower to keep payloads small for the chat UI.
DEFAULT_MAX_RESULTS = 50
HARD_MAX_RESULTS = 250


class CalendarError(Exception):
    """Raised on a non-2xx response from the Calendar API."""

    def __init__(self, status: int, detail: dict | str):
        super().__init__(f"Calendar API {status}: {detail}")
        self.status = status
        self.detail = detail


def list_events(
    access_token: str,
    *,
    calendar_id: str = "primary",
    time_min: Optional[str] = None,
    time_max: Optional[str] = None,
    max_results: int = DEFAULT_MAX_RESULTS,
    query: Optional[str] = None,
) -> list[dict]:
    """Return a list of events from the user's Google Calendar.

    Args:
        access_token: Google OAuth access token with `calendar.readonly` scope.
        calendar_id: Calendar to read. 'primary' = the user's main calendar.
        time_min / time_max: ISO 8601 timestamps. Defaults are server-side
            (Google returns all events if both are omitted).
        max_results: 1..HARD_MAX_RESULTS. Clamped on the way in.
        query: Optional free-text filter (Google's `q` param).

    Returns:
        A list of trimmed event dicts in the shape:
            {
              "id", "summary", "description", "location",
              "start", "end",          # ISO strings
              "all_day": bool,
              "status",                # 'confirmed' | 'tentative' | 'cancelled'
              "html_link",             # link to event in Google Calendar UI
            }

    Raises:
        CalendarError: on non-2xx response (401 = bad/expired token).
    """
    if not access_token:
        raise CalendarError(401, "missing_access_token")

    params: dict[str, str | int | bool] = {
        "singleEvents": "true",      # expand recurring events
        "orderBy": "startTime",
        "maxResults": max(1, min(int(max_results or 0) or DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS)),
    }
    if time_min:
        params["timeMin"] = time_min
    if time_max:
        params["timeMax"] = time_max
    if query:
        params["q"] = query

    url = f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events"
    try:
        resp = httpx.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
    except httpx.RequestError as e:
        logger.error(f"[calendar] upstream unreachable: {e}")
        raise CalendarError(502, str(e)) from e

    if resp.status_code != 200:
        try:
            detail = resp.json()
        except ValueError:
            detail = {"raw": resp.text[:200]}
        # Don't log the full body — it may contain PII (event titles).
        logger.warning(f"[calendar] {resp.status_code} on {calendar_id}: {str(detail)[:120]}")
        raise CalendarError(resp.status_code, detail)

    payload = resp.json()
    return [_simplify_event(e) for e in payload.get("items", [])]


def _simplify_event(event: dict) -> dict:
    """Trim a Google Calendar event to the fields our UI actually uses."""
    start = event.get("start", {}) or {}
    end = event.get("end", {}) or {}
    # All-day events use 'date' (YYYY-MM-DD); timed events use 'dateTime'.
    is_all_day = "date" in start and "dateTime" not in start
    return {
        "id": event.get("id"),
        "summary": event.get("summary", ""),
        "description": event.get("description", ""),
        "location": event.get("location", ""),
        "start": start.get("dateTime") or start.get("date"),
        "end": end.get("dateTime") or end.get("date"),
        "all_day": is_all_day,
        "status": event.get("status", "confirmed"),
        "html_link": event.get("htmlLink", ""),
    }
