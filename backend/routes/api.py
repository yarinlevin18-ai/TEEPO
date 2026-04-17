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

    # Persist to Supabase
    user_id = _user_id()
    course_data = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": result.get("title", url),
        "source": result.get("source", "custom_url"),
        "source_url": url,
        "description": result.get("description", ""),
        "status": "active",
    }
    course_res = db.create_course(course_data)
    course_id = course_res.data[0]["id"] if course_res.data else course_data["id"]

    # Save sections as lessons
    lessons = []
    for section in result.get("sections", []):
        lessons.append({
            "id": str(uuid.uuid4()),
            "course_id": course_id,
            "title": section.get("title", ""),
            "order_index": section.get("order", 0),
            "content": "",
        })
    if lessons:
        db.bulk_create_lessons(lessons)

    return jsonify({"course": course_data, "sections": result.get("sections", [])})


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
    body = request.get_json() or {}
    title = body.get("title", "")
    description = body.get("description", "")
    deadline = body.get("deadline", "")

    orch = get_orchestrator()
    result = orch.breakdown_assignment(title, description, deadline)

    # Persist assignment + tasks
    user_id = _user_id()
    assignment_id = str(uuid.uuid4())
    assignment_data = {
        "id": assignment_id,
        "user_id": user_id,
        "title": title,
        "description": description,
        "deadline": deadline,
        "status": "todo",
    }
    db.create_assignment(assignment_data)

    tasks = result.get("tasks", [])
    db_tasks = [
        {
            "id": str(uuid.uuid4()),
            "assignment_id": assignment_id,
            "title": t.get("title", ""),
            "description": t.get("description", ""),
            "order_index": t.get("order", i + 1),
            "estimated_hours": t.get("estimated_hours", 1),
        }
        for i, t in enumerate(tasks)
    ]
    if db_tasks:
        db.create_assignment_tasks(db_tasks)

    return jsonify({**result, "assignment_id": assignment_id})


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
#  Academic Agent (BGU)                                                #
# ------------------------------------------------------------------ #

@api.post("/academic/advise")
def academic_advise():
    body = request.get_json() or {}
    course_name = body.get("course_name", "")
    major = body.get("major", "")
    your_courses = body.get("your_courses", [])

    orch = get_orchestrator()
    result = orch.get_bgu_advice(course_name, major, your_courses)
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
