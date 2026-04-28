"""REST API routes for the study platform."""
import re
from flask import Blueprint, request, jsonify
from orchestrator_wrapper import get_orchestrator
from services import supabase_client as db
from config import logger
import uuid

# ── Input validation helpers ──────────────────────────────────────────
MAX_TITLE = 500
MAX_DESCRIPTION = 5000
MAX_CONTENT = 50000
ALLOWED_URL_SCHEMES = ("http://", "https://")


def _validate_url(url: str) -> bool:
    """Basic URL validation — must start with http(s) and have a domain."""
    if not url or len(url) > 2000:
        return False
    if not any(url.startswith(s) for s in ALLOWED_URL_SCHEMES):
        return False
    # Block private/internal IPs
    private_patterns = [
        r'https?://localhost', r'https?://127\.', r'https?://0\.0\.0\.0',
        r'https?://10\.', r'https?://172\.(1[6-9]|2\d|3[01])\.', r'https?://192\.168\.',
        r'https?://\[::1\]',
    ]
    for pat in private_patterns:
        if re.match(pat, url, re.I):
            return False
    return True


def _clamp(val, min_val, max_val, default=None):
    """Clamp a numeric value to a range, with optional default."""
    try:
        val = int(val) if val is not None else default
        if val is None:
            return default
        return max(min_val, min(val, max_val))
    except (TypeError, ValueError):
        return default

api = Blueprint("api", __name__, url_prefix="/api")

# Cache verified tokens for 5 minutes to avoid hitting Supabase auth on every request
_token_cache: dict = {}  # token -> (user_id, expiry_time)


def _user_id():
    """Extract and verify user_id from Supabase JWT in Authorization header."""
    import time
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]

        # Check cache first
        cached = _token_cache.get(token)
        if cached and cached[1] > time.time():
            return cached[0]

        # Verify via Supabase auth.get_user()
        try:
            client = db.get_client()
            user_response = client.auth.get_user(token)
            if user_response and user_response.user:
                user_id = user_response.user.id
                # Cache for 5 minutes
                _token_cache[token] = (user_id, time.time() + 300)
                # Clean old cache entries periodically
                if len(_token_cache) > 100:
                    now = time.time()
                    expired = [k for k, v in _token_cache.items() if v[1] < now]
                    for k in expired:
                        del _token_cache[k]
                return user_id
        except Exception as e:
            logger.debug(f"Token verification failed: {e}")

        # Fallback: decode claims without verification (for dev/debugging)
        try:
            from jose import jwt as _jwt
            payload = _jwt.get_unverified_claims(token)
            uid = payload.get("sub")
            if uid:
                logger.warning(f"Using unverified JWT for user {uid[:8]}...")
                return uid
        except Exception:
            pass

    # dev fallback — only works when no token is sent
    return request.headers.get("X-User-Id", "dev-user")


# ------------------------------------------------------------------ #
#  Courses                                                             #
# ------------------------------------------------------------------ #

@api.get("/courses")
def list_courses():
    try:
        result = db.get_courses(_user_id())
        return jsonify(result.data or [])
    except Exception as e:
        logger.warning(f"[courses] DB error: {e}")
        return jsonify([])


@api.get("/courses/<course_id>")
def get_course(course_id: str):
    """Get a single course with its lessons."""
    try:
        user_id = _user_id()
        # Get the course
        course_res = db.get_client().table("courses").select("*").eq("id", course_id).eq("user_id", user_id).limit(1).execute()
        if not course_res.data:
            return jsonify({"error": "קורס לא נמצא"}), 404
        course = course_res.data[0]

        # Get lessons
        lessons_res = db.get_lessons(course_id)
        course["lessons"] = lessons_res.data or []

        return jsonify(course)
    except Exception as e:
        logger.warning(f"[course_detail] DB error: {e}")
        return jsonify({"error": "שגיאה בטעינת הקורס"}), 500


@api.patch("/courses/<course_id>")
def update_course_route(course_id: str):
    """Update a course (semester, year, progress, etc.)."""
    try:
        body = request.get_json() or {}
        allowed = {"semester", "academic_year", "progress_percentage", "status", "title", "description"}
        update_data = {k: v for k, v in body.items() if k in allowed}
        if not update_data:
            return jsonify({"error": "אין שדות לעדכון"}), 400
        from datetime import datetime, timezone
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = db.update_course(course_id, update_data)
        if not result.data:
            return jsonify({"error": "קורס לא נמצא"}), 404
        return jsonify(result.data[0])
    except Exception as e:
        logger.warning(f"[update_course] error: {e}")
        return jsonify({"error": str(e)}), 500


@api.post("/courses/extract")
def extract_course():
    """Run the LLM course extractor and return the structured result.

    Post-Drive-migration the backend no longer owns course storage — the
    client writes the returned `course` + `sections` into the user's Drive
    DB. We used to also insert into Supabase here, but those tables have
    been empty for months and the insert path was a silent failure mode
    without a reader. Keep this endpoint pure-compute.
    """
    body = request.get_json() or {}
    url = body.get("url", "")
    if not url:
        return jsonify({"error": "חסרה כתובת URL"}), 400
    if not _validate_url(url):
        return jsonify({"error": "כתובת URL לא תקינה"}), 400

    orch = get_orchestrator()
    result = orch.extract_course(url)

    if result.get("status") != "success":
        return jsonify({"error": result.get("message", "שגיאה בחילוץ")}), 500

    course_data = {
        "id": str(uuid.uuid4()),
        "title": result.get("title", url),
        "source": result.get("source", "custom_url"),
        "source_url": url,
        "description": result.get("description", ""),
        "status": "active",
    }

    return jsonify({
        "course": course_data,
        "sections": result.get("sections", []),
    })


# ------------------------------------------------------------------ #
#  Tasks                                                               #
# ------------------------------------------------------------------ #

@api.get("/tasks")
def list_tasks():
    try:
        date = request.args.get("date")
        result = db.get_tasks(_user_id(), date)
        return jsonify(result.data or [])
    except Exception as e:
        logger.warning(f"[tasks] DB error: {e}")
        return jsonify([])


@api.post("/tasks")
def create_task():
    body = request.get_json() or {}
    if not body.get("title"):
        return jsonify({"error": "חסר שדה חובה: title"}), 400
    body["id"] = str(uuid.uuid4())
    body["user_id"] = _user_id()
    result = db.create_task(body)
    return jsonify(result.data[0] if result.data else body), 201


@api.patch("/tasks/<task_id>")
def update_task(task_id):
    try:
        body = request.get_json() or {}
        result = db.update_task(task_id, body)
        if not result.data:
            return jsonify({"error": "משימה לא נמצאה"}), 404
        return jsonify(result.data[0])
    except Exception as e:
        logger.warning(f"[update_task] error: {e}")
        return jsonify({"error": str(e)}), 500


@api.delete("/tasks/<task_id>")
def delete_task(task_id):
    try:
        db.delete_task(task_id)
        return jsonify({"ok": True})
    except Exception as e:
        logger.warning(f"[delete_task] error: {e}")
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------------ #
#  Assignments                                                         #
# ------------------------------------------------------------------ #

@api.get("/assignments")
def list_assignments():
    try:
        result = db.get_assignments(_user_id())
        return jsonify(result.data or [])
    except Exception as e:
        logger.warning(f"[assignments] DB error: {e}")
        return jsonify([])


@api.post("/assignments/breakdown")
def breakdown_assignment():
    """Ask the LLM to break an assignment into ordered subtasks.

    Pure-compute endpoint. The client takes the returned `tasks` and writes
    them into Drive DB. (The old Supabase persist path was removed — those
    tables haven't been read post-migration.)
    """
    body = request.get_json() or {}
    title = body.get("title", "")
    description = body.get("description", "")
    deadline = body.get("deadline", "")

    orch = get_orchestrator()
    result = orch.breakdown_assignment(title, description, deadline)

    return jsonify(result)


# ------------------------------------------------------------------ #
#  Grades — manual entry                                              #
# ------------------------------------------------------------------ #

@api.post("/grades/manual")
def create_manual_grade():
    """Create or update a manually-entered grade.

    Coexists with scraped grades (source='moodle' / 'portal'). Uniqueness is
    on (user_id, course_name, semester, component) — re-posting the same
    quartet overwrites the prior value so the user can fix typos without
    accumulating duplicates.
    """
    from datetime import datetime, timezone

    user_id = _user_id()
    body = request.get_json() or {}

    course_name = (body.get("course_name") or "").strip()
    if not course_name:
        return jsonify({"error": "חסר שם קורס"}), 400
    if len(course_name) > MAX_TITLE:
        return jsonify({"error": "שם קורס ארוך מדי"}), 400

    grade_raw = body.get("grade")
    grade_text = (body.get("grade_text") or "").strip() or None
    if grade_raw is None and not grade_text:
        return jsonify({"error": "חובה למלא ציון מספרי או טקסטואלי"}), 400

    grade_num = None
    if grade_raw is not None:
        try:
            grade_num = float(grade_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "ציון מספרי לא תקין"}), 400
        if not (0 <= grade_num <= 100):
            return jsonify({"error": "ציון חייב להיות בטווח 0–100"}), 400

    credits_raw = body.get("credits")
    credits_num = None
    if credits_raw is not None:
        try:
            credits_num = float(credits_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "נקודות זכות לא תקינות"}), 400
        if not (0 <= credits_num <= 30):
            return jsonify({"error": "נקודות זכות בטווח 0–30"}), 400

    semester = (body.get("semester") or "").strip() or None
    academic_year = (body.get("academic_year") or "").strip() or None
    component = (body.get("component") or "").strip() or None

    if semester and len(semester) > 50:
        return jsonify({"error": "סמסטר ארוך מדי"}), 400
    if academic_year and len(academic_year) > 20:
        return jsonify({"error": "שנת לימודים ארוכה מדי"}), 400
    if component and len(component) > 100:
        return jsonify({"error": "שם רכיב ארוך מדי"}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    row = {
        "user_id": user_id,
        "course_name": course_name,
        "source": "manual",
        "updated_at": now_iso,
    }
    if grade_num is not None:
        row["grade"] = grade_num
    if grade_text:
        row["grade_text"] = grade_text
    if credits_num is not None:
        row["credits"] = credits_num
    if semester:
        row["semester"] = semester
    if academic_year:
        row["academic_year"] = academic_year
    if component:
        row["component"] = component

    try:
        client = db.get_client()
        # Upsert manually: SELECT existing match, then UPDATE or INSERT.
        # We don't rely on PostgREST on_conflict because the unique index uses
        # COALESCE() expressions which on_conflict can't target directly.
        existing_q = (
            client.table("student_grades")
            .select("id")
            .eq("user_id", user_id)
            .eq("course_name", course_name)
        )
        if semester:
            existing_q = existing_q.eq("semester", semester)
        else:
            existing_q = existing_q.is_("semester", "null")
        if component:
            existing_q = existing_q.eq("component", component)
        else:
            existing_q = existing_q.is_("component", "null")
        existing = existing_q.limit(1).execute()

        if existing.data:
            grade_id = existing.data[0]["id"]
            result = client.table("student_grades").update(row).eq("id", grade_id).execute()
            status_code = 200
        else:
            result = client.table("student_grades").insert(row).execute()
            status_code = 201
    except Exception as e:
        logger.warning(f"[manual_grade] DB error: {e}")
        return jsonify({"error": "שגיאה בשמירת ציון"}), 500

    return jsonify(result.data[0] if result.data else row), status_code


# ------------------------------------------------------------------ #
#  Study Plan                                                          #
# ------------------------------------------------------------------ #

@api.post("/study-plan")
def create_study_plan():
    body = request.get_json() or {}
    courses = body.get("courses", [])[:20]  # max 20 courses
    deadline = body.get("deadline", "")[:20]
    hours_per_week = _clamp(body.get("hours_per_week"), 1, 80, default=10)

    orch = get_orchestrator()
    result = orch.create_study_plan(courses, deadline, hours_per_week)
    return jsonify(result)


# ------------------------------------------------------------------ #
#  Academic Agent (BGU / TAU)                                          #
# ------------------------------------------------------------------ #

@api.post("/academic/advise")
def academic_advise():
    body = request.get_json() or {}
    course_name = body.get("course_name", "")
    major = body.get("major", "")
    your_courses = body.get("your_courses", [])
    university = (body.get("university") or "bgu").lower()
    if university not in ("bgu", "tau"):
        university = "bgu"

    orch = get_orchestrator()
    result = orch.get_academic_advice(course_name, major, your_courses, university=university)
    return jsonify(result)


# ------------------------------------------------------------------ #
#  Google Docs Fetch                                                   #
# ------------------------------------------------------------------ #

@api.post("/gdocs/fetch")
def fetch_google_doc():
    """Fetch plain-text content from a public Google Docs link.
    Works with any doc shared as 'Anyone with the link can view'.
    Converts the share URL to export?format=txt automatically."""
    body = request.get_json() or {}
    url = body.get("url", "").strip()

    if not url:
        return jsonify({"error": "חסר קישור ל-Google Docs"}), 400

    # Extract doc ID from various Google Docs URL formats
    doc_id = None
    patterns = [
        r'docs\.google\.com/document/d/([a-zA-Z0-9_-]+)',
        r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)',
        r'drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)',
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            doc_id = m.group(1)
            break

    if not doc_id:
        return jsonify({"error": "לא ניתן לזהות מסמך Google. ודא שהקישור תקין."}), 400

    # Fetch as plain text
    export_url = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
    try:
        import requests as http_requests
        resp = http_requests.get(export_url, timeout=15)
        if resp.status_code == 404:
            return jsonify({"error": "המסמך לא נמצא. ודא שהקישור נכון."}), 404
        if resp.status_code == 403:
            return jsonify({"error": "אין גישה למסמך. ודא שהמסמך משותף עם 'כל מי שיש לו את הקישור'."}), 403
        resp.raise_for_status()

        text = resp.text.strip()
        if not text:
            return jsonify({"error": "המסמך ריק."}), 400

        # Truncate if too long
        text = text[:MAX_CONTENT]

        return jsonify({
            "content": text,
            "title": text.split('\n')[0][:200] if text else "Google Doc",
            "char_count": len(text),
        })
    except Exception as e:
        logger.warning(f"[gdocs_fetch] error: {e}")
        return jsonify({"error": "שגיאה בשליפת המסמך מ-Google."}), 500


# ------------------------------------------------------------------ #
#  Google Calendar (read-only)                                         #
# ------------------------------------------------------------------ #

@api.get("/calendar/events")
def list_calendar_events():
    """List events from the user's Google Calendar.

    Auth: Google access token in `X-Google-Token` header (or body for POST).
    Query params:
      - start: ISO 8601 timeMin (optional)
      - end:   ISO 8601 timeMax (optional)
      - q:     free-text filter (optional)
      - max:   1..250, default 50
      - calendar_id: defaults to 'primary'
    """
    from services import google_calendar

    google_token = request.headers.get("X-Google-Token", "").strip()
    if not google_token:
        return jsonify({"error": "חסר טוקן Google"}), 401

    try:
        events = google_calendar.list_events(
            google_token,
            calendar_id=request.args.get("calendar_id", "primary"),
            time_min=request.args.get("start") or None,
            time_max=request.args.get("end") or None,
            query=request.args.get("q") or None,
            max_results=_clamp(request.args.get("max"), 1, 250, default=50),
        )
    except google_calendar.CalendarError as e:
        if e.status == 401:
            return jsonify({"error": "טוקן Google לא תקף או פג תוקף"}), 401
        if e.status == 403:
            return jsonify({"error": "אין הרשאת קריאה ל-Google Calendar"}), 403
        return jsonify({"error": "שגיאה בטעינת היומן"}), 502

    return jsonify({"events": events, "count": len(events)})


# ------------------------------------------------------------------ #
#  Lesson Summarize                                                    #
# ------------------------------------------------------------------ #

# ------------------------------------------------------------------ #
#  Course Notes                                                        #
# ------------------------------------------------------------------ #

@api.get("/courses/<course_id>/notes")
def list_course_notes(course_id: str):
    """List all notes for a course."""
    try:
        user_id = _user_id()
        result = db.get_course_notes(course_id, user_id)
        return jsonify(result.data or [])
    except Exception as e:
        logger.warning(f"[course_notes] DB error: {e}")
        return jsonify([])


@api.post("/courses/<course_id>/notes")
def create_course_note(course_id: str):
    """Create a new note for a course."""
    body = request.get_json() or {}
    title = body.get("title", "")[:MAX_TITLE]
    content = body.get("content", "")[:MAX_CONTENT]
    note_type = body.get("note_type", "manual")

    if not content.strip() and not title.strip():
        return jsonify({"error": "חסר תוכן או כותרת"}), 400

    note_data = {
        "id": str(uuid.uuid4()),
        "course_id": course_id,
        "user_id": _user_id(),
        "title": title,
        "content": content,
        "note_type": note_type,
        "file_name": body.get("file_name"),
    }
    try:
        result = db.create_course_note(note_data)
        return jsonify(result.data[0] if result.data else note_data), 201
    except Exception as e:
        logger.warning(f"[create_note] DB error: {e}")
        return jsonify({"error": "שגיאה בשמירת ההערה"}), 500


@api.patch("/courses/<course_id>/notes/<note_id>")
def update_course_note(course_id: str, note_id: str):
    """Update a note."""
    body = request.get_json() or {}
    update_data = {}
    if "title" in body:
        update_data["title"] = body["title"][:MAX_TITLE]
    if "content" in body:
        update_data["content"] = body["content"][:MAX_CONTENT]
    if not update_data:
        return jsonify({"error": "אין שדות לעדכון"}), 400

    from datetime import datetime, timezone
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        result = db.update_course_note(note_id, _user_id(), update_data)
        if not result.data:
            return jsonify({"error": "הערה לא נמצאה"}), 404
        return jsonify(result.data[0])
    except Exception as e:
        logger.warning(f"[update_note] error: {e}")
        return jsonify({"error": str(e)}), 500


@api.delete("/courses/<course_id>/notes/<note_id>")
def delete_course_note(course_id: str, note_id: str):
    """Delete a note."""
    try:
        db.delete_course_note(note_id, _user_id())
        return jsonify({"ok": True})
    except Exception as e:
        logger.warning(f"[delete_note] error: {e}")
        return jsonify({"error": str(e)}), 500


@api.post("/courses/<course_id>/notes/summarize")
def summarize_note_content(course_id: str):
    """Take pasted or uploaded text content and generate an AI summary as a note."""
    body = request.get_json() or {}
    content = body.get("content", "")[:MAX_CONTENT]
    title = body.get("title", "סיכום")[:MAX_TITLE]

    if not content.strip():
        return jsonify({"error": "חסר תוכן לסיכום"}), 400

    try:
        orch = get_orchestrator()
        result = orch.summarize_lesson(content, title)
        summary_text = result.get("result") or result.get("summary") or result.get("answer") or ""

        # Save as a note
        note_data = {
            "id": str(uuid.uuid4()),
            "course_id": course_id,
            "user_id": _user_id(),
            "title": f"סיכום AI: {title}",
            "content": summary_text,
            "note_type": "ai_generated",
            "file_name": body.get("file_name"),
        }
        db_result = db.create_course_note(note_data)
        return jsonify(db_result.data[0] if db_result.data else note_data), 201
    except Exception as e:
        logger.warning(f"[summarize_note] error: {e}")
        return jsonify({"error": "שגיאה ביצירת הסיכום"}), 500


# ------------------------------------------------------------------ #
#  Lesson toggle completion                                            #
# ------------------------------------------------------------------ #

@api.post("/courses/<course_id>/lessons")
def create_lesson_for_course(course_id: str):
    """Create a new user-defined lesson in a course."""
    user_id = _user_id()
    body = request.get_json() or {}
    title = str(body.get("title", "")).strip()[:MAX_TITLE]
    if not title:
        return jsonify({"error": "חסר שם שיעור"}), 400

    try:
        client = db.get_client()
        # Get next order_index
        existing = client.table("lessons").select("order_index").eq("course_id", course_id).order("order_index", desc=True).limit(1).execute()
        next_idx = (existing.data[0]["order_index"] + 1) if existing.data else 0

        lesson = {
            "id": str(uuid.uuid4()),
            "course_id": course_id,
            "title": title,
            "content": body.get("content", ""),
            "order_index": next_idx,
            "is_completed": False,
            "files": body.get("files", []),
        }
        result = client.table("lessons").insert(lesson).execute()
        return jsonify(result.data[0] if result.data else lesson), 201
    except Exception as e:
        logger.warning(f"[create_lesson] error: {e}")
        return jsonify({"error": str(e)}), 500


@api.delete("/lessons/<lesson_id>")
def delete_lesson(lesson_id: str):
    """Delete a lesson and recalculate course progress."""
    try:
        client = db.get_client()
        # Get lesson to find course_id before deleting
        lesson_res = client.table("lessons").select("course_id").eq("id", lesson_id).limit(1).execute()
        course_id = lesson_res.data[0]["course_id"] if lesson_res.data else None

        client.table("lessons").delete().eq("id", lesson_id).execute()

        # Recalculate course progress
        if course_id:
            all_lessons = client.table("lessons").select("is_completed").eq("course_id", course_id).execute()
            if all_lessons.data:
                total = len(all_lessons.data)
                done = sum(1 for l in all_lessons.data if l.get("is_completed"))
                progress = round((done / total) * 100) if total > 0 else 0
                client.table("courses").update({"progress_percentage": progress}).eq("id", course_id).execute()
            else:
                client.table("courses").update({"progress_percentage": 0}).eq("id", course_id).execute()

        return jsonify({"ok": True})
    except Exception as e:
        logger.warning(f"[delete_lesson] error: {e}")
        return jsonify({"error": str(e)}), 500


@api.patch("/lessons/<lesson_id>")
def update_lesson(lesson_id: str):
    """Update lesson fields (title, content, files, completion)."""
    body = request.get_json() or {}
    try:
        client = db.get_client()
        update_data = {}

        if "title" in body:
            update_data["title"] = str(body["title"]).strip()[:MAX_TITLE]
        if "content" in body:
            update_data["content"] = str(body["content"])[:MAX_CONTENT]
        if "files" in body:
            update_data["files"] = body["files"]  # JSON array
        if "ai_summary" in body:
            update_data["ai_summary"] = str(body["ai_summary"])[:MAX_CONTENT]
        if "transcript" in body:
            update_data["transcript"] = str(body["transcript"])[:MAX_CONTENT * 4]
        if "recap" in body:
            update_data["recap"] = str(body["recap"])[:MAX_CONTENT]
        if "is_completed" in body:
            update_data["is_completed"] = bool(body["is_completed"])
            if body["is_completed"]:
                from datetime import datetime, timezone
                update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
            else:
                update_data["completed_at"] = None

        if not update_data:
            return jsonify({"error": "אין שדות לעדכון"}), 400

        result = client.table("lessons").update(update_data).eq("id", lesson_id).execute()
        if not result.data:
            return jsonify({"error": "שיעור לא נמצא"}), 404

        # Recalculate course progress if completion changed
        if "is_completed" in body:
            lesson = result.data[0]
            course_id = lesson.get("course_id")
            if course_id:
                all_lessons = client.table("lessons").select("is_completed").eq("course_id", course_id).execute()
                if all_lessons.data:
                    total = len(all_lessons.data)
                    done = sum(1 for l in all_lessons.data if l.get("is_completed"))
                    progress = round((done / total) * 100) if total > 0 else 0
                    client.table("courses").update({"progress_percentage": progress}).eq("id", course_id).execute()

        return jsonify(result.data[0])
    except Exception as e:
        logger.warning(f"[update_lesson] error: {e}")
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------------ #
#  Lesson Summarize                                                    #
# ------------------------------------------------------------------ #

@api.post("/lessons/summarize")
def summarize_lesson():
    body = request.get_json() or {}
    content = body.get("content", "")[:MAX_CONTENT]
    title = body.get("title", "")[:MAX_TITLE]
    if not content:
        return jsonify({"error": "חסר תוכן שיעור"}), 400

    orch = get_orchestrator()
    result = orch.summarize_lesson(content, title)
    return jsonify(result)


@api.post("/lessons/quiz")
def generate_quiz():
    body = request.get_json() or {}
    lesson_text = body.get("content", "")[:MAX_CONTENT]
    num_questions = _clamp(body.get("num_questions"), 1, 50, default=10)
    if not lesson_text:
        return jsonify({"error": "חסר תוכן שיעור"}), 400

    orch = get_orchestrator()
    result = orch.generate_quiz(lesson_text, num_questions)
    return jsonify(result)


# ------------------------------------------------------------------ #
#  Lesson Recording — Whisper transcription + summary                  #
# ------------------------------------------------------------------ #

# Max audio upload: 24 MB (Whisper API limit is 25 MB — leave headroom).
MAX_AUDIO_BYTES = 24 * 1024 * 1024


@api.post("/lessons/<lesson_id>/transcribe")
def transcribe_lesson(lesson_id: str):
    """
    Accept an audio file, send it to OpenAI Whisper (language=he), save the
    transcript on the lesson row, and return both transcript + an AI summary.

    Request: multipart/form-data with field ``audio`` (file blob).
    Response: { transcript, summary, lesson: { id, transcript, recap } }
    """
    import os as _os

    if "audio" not in request.files:
        return jsonify({"error": "לא נשלח קובץ אודיו"}), 400

    f = request.files["audio"]
    raw = f.read()
    if len(raw) == 0:
        return jsonify({"error": "קובץ ריק"}), 400
    if len(raw) > MAX_AUDIO_BYTES:
        return jsonify({
            "error": f"הקובץ גדול מדי ({len(raw) // (1024*1024)}MB). מקסימום 24MB."
        }), 413

    openai_key = _os.getenv("OPENAI_API_KEY", "")
    if not openai_key:
        return jsonify({"error": "תמלול לא מוגדר בשרת (OPENAI_API_KEY חסר)."}), 503

    try:
        # Lazy import so dev environments without openai installed don't crash on import
        from openai import OpenAI
        client_oa = OpenAI(api_key=openai_key)

        # Whisper wants a file-like object with a .name attribute
        import io
        buf = io.BytesIO(raw)
        buf.name = f.filename or "recording.webm"

        tx = client_oa.audio.transcriptions.create(
            model="whisper-1",
            file=buf,
            language="he",
            response_format="text",
        )
        transcript_text = (tx if isinstance(tx, str) else getattr(tx, "text", "")) or ""
        transcript_text = transcript_text.strip()

        if not transcript_text:
            return jsonify({"error": "לא זוהה דיבור בקובץ"}), 422

    except Exception as e:
        logger.warning(f"[transcribe] whisper error: {e}")
        return jsonify({"error": f"תמלול נכשל: {e}"}), 500

    # Ask Claude for a concise Hebrew study summary of the transcript
    summary_text = ""
    try:
        orch = get_orchestrator()
        summary_res = orch.summarize_lesson(transcript_text[:MAX_CONTENT], "הקלטת שיעור")
        summary_text = (
            summary_res.get("result")
            or summary_res.get("summary")
            or summary_res.get("answer")
            or ""
        )
    except Exception as e:
        logger.warning(f"[transcribe] summary failed (non-fatal): {e}")

    # Persist transcript + recap on the lesson
    lesson_row = None
    try:
        sb = db.get_client()
        patch = {
            "transcript": transcript_text[:MAX_CONTENT * 4],
        }
        if summary_text:
            patch["recap"] = summary_text[:MAX_CONTENT]
        res = sb.table("lessons").update(patch).eq("id", lesson_id).execute()
        lesson_row = res.data[0] if res.data else None
    except Exception as e:
        logger.warning(f"[transcribe] db save failed (non-fatal): {e}")

    return jsonify({
        "transcript": transcript_text,
        "summary": summary_text,
        "lesson": lesson_row,
    })


# ====================================================================== #
#  Long-form recording pipeline — chunked Whisper + async job tracking    #
# ====================================================================== #
#
# The sync /transcribe endpoint above handles <24 MB audio (a short tutor
# session). Real lectures + Zoom recordings are 80–400 MB, so we:
#
#   1. Stream the upload to a temp file (no 500 MB in memory).
#   2. Kick off a background thread → return { job_id } immediately.
#   3. Thread uses ffmpeg to split into 10-minute mono 64 kbps mp3 chunks
#      (~5 MB each, well under Whisper's 25 MB cap).
#   4. Sequentially calls Whisper on each chunk, concatenates text.
#   5. Asks Claude for a Hebrew summary, saves transcript + recap to DB.
#   6. Frontend polls /transcribe/jobs/<id> every 2 s for stage + progress.
#
# Jobs live in process memory (2 h TTL) — fine for the current single-box
# deployment; migrate to Redis / RQ when this becomes multi-worker.

import os as _os_mod
import time as _time_mod
import threading as _threading_mod
import tempfile as _tempfile_mod
import subprocess as _subprocess_mod

MAX_TRANSCRIBE_BYTES = 500 * 1024 * 1024  # 500 MB
CHUNK_SECONDS = 600                       # 10-minute chunks
_JOB_TTL_SEC = 2 * 3600                   # keep job state for 2 hours

# { job_id: { lesson_id, stage, progress, total, transcript, summary, error,
#             created_at, updated_at, filename, size_bytes } }
_tx_jobs: dict = {}
_tx_jobs_lock = _threading_mod.Lock()


def _tx_set(job_id: str, **kwargs) -> None:
    """Atomic partial update of a job's state dict."""
    with _tx_jobs_lock:
        job = _tx_jobs.get(job_id)
        if job is None:
            return
        job.update(kwargs)
        job["updated_at"] = _time_mod.time()


def _tx_get(job_id: str) -> dict:
    with _tx_jobs_lock:
        job = _tx_jobs.get(job_id)
        return dict(job) if job else {}


def _tx_cleanup_old() -> None:
    """Drop jobs older than TTL so memory doesn't grow unbounded."""
    now = _time_mod.time()
    with _tx_jobs_lock:
        stale = [k for k, v in _tx_jobs.items()
                 if now - v.get("created_at", 0) > _JOB_TTL_SEC]
        for k in stale:
            _tx_jobs.pop(k, None)


def _ffmpeg_split(src_path: str, out_dir: str) -> list:
    """
    Convert any input container to a series of 10-minute mono 64 kbps mp3
    chunks that each fit comfortably under Whisper's 25 MB cap.

    Raises RuntimeError with the last 600 chars of ffmpeg stderr on failure.
    """
    cmd = [
        "ffmpeg", "-y", "-i", src_path,
        "-vn",                        # drop any video stream (mp4 from Zoom)
        "-ac", "1",                   # mono
        "-ar", "16000",               # 16 kHz — Whisper's native rate
        "-b:a", "64k",                # ~5 MB per 10-minute chunk
        "-c:a", "libmp3lame",
        "-f", "segment",
        "-segment_time", str(CHUNK_SECONDS),
        "-reset_timestamps", "1",
        _os_mod.path.join(out_dir, "chunk_%03d.mp3"),
    ]
    try:
        _subprocess_mod.run(
            cmd, check=True,
            capture_output=True,
            timeout=20 * 60,          # worst case: ~15 min for a 400 MB file
        )
    except _subprocess_mod.CalledProcessError as e:
        tail = (e.stderr or b"").decode("utf-8", errors="replace")[-600:]
        raise RuntimeError(f"ffmpeg failed: {tail}") from e
    except _subprocess_mod.TimeoutExpired as e:
        raise RuntimeError("ffmpeg timed out (>20 min)") from e

    files = sorted(
        f for f in _os_mod.listdir(out_dir)
        if f.startswith("chunk_") and f.endswith(".mp3")
    )
    if not files:
        raise RuntimeError("ffmpeg produced no chunks (unsupported file?)")
    return [_os_mod.path.join(out_dir, f) for f in files]


def _run_tx_job(job_id: str, lesson_id: str, src_path: str) -> None:
    """Worker thread: chunk → whisper each chunk → summarize → save."""
    try:
        openai_key = _os_mod.getenv("OPENAI_API_KEY", "")
        if not openai_key:
            _tx_set(job_id, stage="error",
                    error="תמלול לא מוגדר בשרת (OPENAI_API_KEY חסר).")
            return

        from openai import OpenAI
        client_oa = OpenAI(api_key=openai_key)

        with _tempfile_mod.TemporaryDirectory(prefix="tx_") as tmp:
            # ── 1. chunk ────────────────────────────────────────────
            _tx_set(job_id, stage="chunking")
            try:
                chunks = _ffmpeg_split(src_path, tmp)
            except Exception as e:
                logger.warning(f"[tx {job_id}] ffmpeg: {e}")
                _tx_set(job_id, stage="error",
                        error="עיבוד הקובץ נכשל. ייתכן שהפורמט לא נתמך.")
                return

            # ── 2. transcribe each chunk ────────────────────────────
            _tx_set(job_id, stage="transcribing", progress=0, total=len(chunks))
            parts = []
            for i, cpath in enumerate(chunks):
                try:
                    with open(cpath, "rb") as cf:
                        tx = client_oa.audio.transcriptions.create(
                            model="whisper-1",
                            file=cf,
                            language="he",
                            response_format="text",
                        )
                    text = (tx if isinstance(tx, str)
                            else getattr(tx, "text", "")) or ""
                    parts.append(text.strip())
                except Exception as e:
                    logger.warning(f"[tx {job_id}] whisper chunk {i}: {e}")
                    # Keep going — one bad chunk shouldn't kill the whole job
                    parts.append("")
                _tx_set(job_id, progress=i + 1)

            transcript = " ".join(p for p in parts if p).strip()
            if not transcript:
                _tx_set(job_id, stage="error",
                        error="לא זוהה דיבור בקובץ.")
                return

            # ── 3. summarize via Claude ─────────────────────────────
            _tx_set(job_id, stage="summarizing")
            summary = ""
            try:
                orch = get_orchestrator()
                s = orch.summarize_lesson(
                    transcript[:MAX_CONTENT],
                    "הקלטת שיעור",
                )
                summary = (
                    s.get("result") or s.get("summary") or s.get("answer") or ""
                ).strip()
            except Exception as e:
                logger.warning(f"[tx {job_id}] summary failed (non-fatal): {e}")

            # ── 4. persist ──────────────────────────────────────────
            _tx_set(job_id, stage="saving")
            try:
                sb = db.get_client()
                patch = {"transcript": transcript[:MAX_CONTENT * 4]}
                if summary:
                    patch["recap"] = summary[:MAX_CONTENT]
                sb.table("lessons").update(patch).eq("id", lesson_id).execute()
            except Exception as e:
                logger.warning(f"[tx {job_id}] db save failed (non-fatal): {e}")

            _tx_set(job_id, stage="done",
                    transcript=transcript, summary=summary)

    except Exception as e:
        logger.exception(f"[tx {job_id}] unexpected error")
        _tx_set(job_id, stage="error", error=f"שגיאה לא צפויה: {e}")
    finally:
        # Always clean up the uploaded temp file.
        try:
            _os_mod.unlink(src_path)
        except Exception:
            pass


@api.post("/lessons/<lesson_id>/transcribe/start")
def transcribe_lesson_start(lesson_id: str):
    """
    Accept a large audio/video upload, stream it to disk, kick off the
    chunking+transcribe pipeline in a background thread, and return a
    job_id the client can poll.
    """
    if "audio" not in request.files:
        return jsonify({"error": "לא נשלח קובץ"}), 400

    f = request.files["audio"]
    original_name = f.filename or "recording"

    # Preserve extension so ffmpeg can sniff the container.
    _, ext = _os_mod.path.splitext(original_name)
    if not ext or len(ext) > 8:
        ext = ".bin"

    fd, tmp_path = _tempfile_mod.mkstemp(prefix="tx_src_", suffix=ext)
    total = 0
    try:
        with _os_mod.fdopen(fd, "wb") as out:
            while True:
                buf = f.stream.read(1024 * 1024)
                if not buf:
                    break
                total += len(buf)
                if total > MAX_TRANSCRIBE_BYTES:
                    raise ValueError("too_large")
                out.write(buf)
    except ValueError:
        try: _os_mod.unlink(tmp_path)
        except Exception: pass
        return jsonify({
            "error": f"הקובץ גדול מדי (מעל {MAX_TRANSCRIBE_BYTES // (1024*1024)}MB)."
        }), 413
    except Exception as e:
        try: _os_mod.unlink(tmp_path)
        except Exception: pass
        return jsonify({"error": f"העלאה נכשלה: {e}"}), 500

    if total == 0:
        try: _os_mod.unlink(tmp_path)
        except Exception: pass
        return jsonify({"error": "קובץ ריק"}), 400

    job_id = uuid.uuid4().hex
    now = _time_mod.time()
    with _tx_jobs_lock:
        _tx_jobs[job_id] = {
            "lesson_id": lesson_id,
            "stage": "queued",
            "progress": 0,
            "total": 0,
            "transcript": "",
            "summary": "",
            "error": None,
            "created_at": now,
            "updated_at": now,
            "filename": original_name,
            "size_bytes": total,
        }

    _threading_mod.Thread(
        target=_run_tx_job,
        args=(job_id, lesson_id, tmp_path),
        daemon=True,
    ).start()

    _tx_cleanup_old()
    return jsonify({"job_id": job_id, "size_bytes": total, "filename": original_name})


@api.get("/transcribe/jobs/<job_id>")
def transcribe_job_status(job_id: str):
    """Poll endpoint — returns current stage/progress and final result."""
    job = _tx_get(job_id)
    if not job:
        return jsonify({"error": "job_not_found"}), 404
    stage = job.get("stage")
    return jsonify({
        "stage": stage,
        "progress": job.get("progress", 0),
        "total": job.get("total", 0),
        "error": job.get("error"),
        # Only ship the heavy fields when the job is complete.
        "transcript": job.get("transcript", "") if stage == "done" else "",
        "summary":    job.get("summary", "")    if stage == "done" else "",
        "filename":   job.get("filename", ""),
        "size_bytes": job.get("size_bytes", 0),
    })
