"""REST API routes for the study platform.

After the Drive-DB migration, the backend no longer owns per-user CRUD
(courses / tasks / assignments / notes / lessons). What's left here are
the two endpoints the frontend still calls:

  - POST /api/assignments/breakdown — LLM-powered subtask generation
  - POST /api/grades/manual         — upsert a manually entered grade

Everything else (Moodle / Portal scraping, sync, catalog, auth) lives
in its own blueprint under backend/routes/.
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from orchestrator_wrapper import get_orchestrator
from services import supabase_client as db
from config import logger

MAX_TITLE = 500
MAX_CONTENT = 50000

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
#  Assignments — LLM breakdown                                         #
# ------------------------------------------------------------------ #

@api.post("/assignments/breakdown")
def breakdown_assignment():
    """Ask the LLM to break an assignment into ordered subtasks.

    Pure-compute endpoint. The client takes the returned `tasks` and writes
    them into Drive DB.
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
