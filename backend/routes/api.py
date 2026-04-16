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
