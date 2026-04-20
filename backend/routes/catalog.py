"""
BGU Course Catalog & Student Profile Routes
"""
from flask import Blueprint, request, jsonify
from config import logger

catalog = Blueprint("catalog", __name__, url_prefix="/api/catalog")


def _user_id():
    from routes.api import _user_id as _api_user_id
    return _api_user_id()


def _db():
    from services.supabase_client import get_client
    return get_client()


# ── Departments & Tracks ─────────────────────────────────────────

@catalog.get("/departments")
def list_departments():
    """List all available departments."""
    try:
        result = _db().table("bgu_departments").select("*").execute()
        return jsonify(result.data or [])
    except Exception as e:
        logger.error(f"[catalog] departments: {e}")
        return jsonify([])


@catalog.get("/tracks")
def list_tracks():
    """List all available study tracks."""
    try:
        result = _db().table("bgu_tracks").select("*").execute()
        return jsonify(result.data or [])
    except Exception as e:
        logger.error(f"[catalog] tracks: {e}")
        return jsonify([])


@catalog.get("/tracks/<track_id>")
def get_track(track_id: str):
    """Get track details + its mandatory courses."""
    try:
        track = _db().table("bgu_tracks").select("*").eq("id", track_id).execute()
        if not track.data:
            return jsonify({"error": "מסלול לא נמצא"}), 404

        courses = (_db().table("bgu_course_catalog")
                   .select("*")
                   .contains("tracks", [track_id])
                   .order("year")
                   .order("semester")
                   .execute())

        return jsonify({
            "track": track.data[0],
            "courses": courses.data or [],
        })
    except Exception as e:
        logger.error(f"[catalog] track {track_id}: {e}")
        return jsonify({"error": str(e)}), 500


# ── Course Catalog Search ────────────────────────────────────────

@catalog.get("/courses")
def search_courses():
    """Search course catalog. ?q=מבוא&dept=politics&limit=20"""
    q = request.args.get("q", "").strip()
    dept = request.args.get("dept", "")
    track = request.args.get("track", "")
    limit = min(int(request.args.get("limit", 50)), 200)

    try:
        query = _db().table("bgu_course_catalog").select("*")

        if q:
            # Search by name (Hebrew) or course ID
            query = query.or_(f"name.ilike.%{q}%,course_id.ilike.%{q}%,name_en.ilike.%{q}%")

        if dept:
            query = query.eq("department", dept)

        if track:
            query = query.contains("tracks", [track])

        result = query.limit(limit).execute()
        return jsonify(result.data or [])
    except Exception as e:
        logger.error(f"[catalog] search: {e}")
        return jsonify([])


@catalog.get("/courses/<course_id>")
def get_course(course_id: str):
    """Get a single course by ID."""
    try:
        result = _db().table("bgu_course_catalog").select("*").eq("course_id", course_id).execute()
        if not result.data:
            return jsonify({"error": "קורס לא נמצא"}), 404
        return jsonify(result.data[0])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Student Profile ──────────────────────────────────────────────

@catalog.get("/profile")
def get_profile():
    """Get student's academic profile."""
    user_id = _user_id()
    try:
        result = _db().table("student_profile").select("*").eq("user_id", user_id).execute()
        if not result.data:
            return jsonify({"profile": None, "needs_onboarding": True})

        profile = result.data[0]
        # Also fetch track info
        track = None
        if profile.get("track_id"):
            t = _db().table("bgu_tracks").select("*").eq("id", profile["track_id"]).execute()
            track = t.data[0] if t.data else None

        return jsonify({
            "profile": profile,
            "track": track,
            "needs_onboarding": False,
        })
    except Exception as e:
        logger.error(f"[catalog] profile: {e}")
        return jsonify({"profile": None, "needs_onboarding": True})


@catalog.post("/profile")
def save_profile():
    """Save/update student's academic profile (onboarding)."""
    user_id = _user_id()
    body = request.get_json() or {}
    from datetime import datetime as _dt

    try:
        data = {
            "user_id": user_id,
            "updated_at": _dt.utcnow().isoformat(),
        }
        for field in ["track_id", "start_year", "current_year", "expected_end"]:
            if field in body:
                data[field] = body[field]

        _db().table("student_profile").upsert(data, on_conflict="user_id").execute()
        return jsonify({"status": "success"})
    except Exception as e:
        logger.error(f"[catalog] save profile: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ── Student Courses ──────────────────────────────────────────────

@catalog.get("/my-courses")
def get_my_courses():
    """Get all courses the student added."""
    user_id = _user_id()
    try:
        result = (_db().table("student_courses")
                  .select("*")
                  .eq("user_id", user_id)
                  .order("academic_year", desc=True)
                  .execute())
        return jsonify(result.data or [])
    except Exception as e:
        logger.error(f"[catalog] my-courses: {e}")
        return jsonify([])


@catalog.post("/my-courses")
def add_my_course():
    """Add a course to student's list."""
    user_id = _user_id()
    body = request.get_json() or {}
    from datetime import datetime as _dt

    course_id = body.get("course_id", "")
    course_name = body.get("course_name", "")
    credits = body.get("credits", 0)

    if not course_name:
        return jsonify({"error": "חסר שם קורס"}), 400

    try:
        data = {
            "user_id": user_id,
            "course_id": course_id or f"manual_{_dt.now().timestamp()}",
            "course_name": course_name,
            "credits": credits,
            "status": body.get("status", "completed"),
            "grade": body.get("grade"),
            "semester": body.get("semester"),
            "academic_year": body.get("academic_year"),
            "source": body.get("source", "manual"),
            "updated_at": _dt.utcnow().isoformat(),
        }

        _db().table("student_courses").upsert(data, on_conflict="user_id,course_id").execute()
        return jsonify({"status": "success"})
    except Exception as e:
        logger.error(f"[catalog] add course: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@catalog.post("/my-courses/bulk")
def add_courses_bulk():
    """Add multiple courses at once (e.g., all mandatory courses for a track)."""
    user_id = _user_id()
    body = request.get_json() or {}
    courses = body.get("courses", [])
    from datetime import datetime as _dt

    if not courses:
        return jsonify({"error": "אין קורסים"}), 400

    try:
        rows = []
        for c in courses:
            rows.append({
                "user_id": user_id,
                "course_id": c.get("course_id", ""),
                "course_name": c.get("course_name", c.get("name", "")),
                "credits": c.get("credits", 0),
                "status": c.get("status", "completed"),
                "grade": c.get("grade"),
                "semester": c.get("semester"),
                "academic_year": c.get("academic_year"),
                "source": c.get("source", "catalog"),
                "updated_at": _dt.utcnow().isoformat(),
            })
        _db().table("student_courses").upsert(rows, on_conflict="user_id,course_id").execute()
        return jsonify({"status": "success", "count": len(rows)})
    except Exception as e:
        logger.error(f"[catalog] bulk add: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@catalog.delete("/my-courses/<course_id>")
def remove_my_course(course_id: str):
    """Remove a course from student's list."""
    user_id = _user_id()
    try:
        _db().table("student_courses").delete().eq("user_id", user_id).eq("course_id", course_id).execute()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ── Credit Summary ───────────────────────────────────────────────

@catalog.get("/credits")
def credit_summary():
    """Calculate credit summary for the student."""
    user_id = _user_id()
    try:
        # Get profile
        profile_res = _db().table("student_profile").select("*").eq("user_id", user_id).execute()
        profile = profile_res.data[0] if profile_res.data else None

        if not profile or not profile.get("track_id"):
            return jsonify({"status": "no_profile"})

        # Get track
        track_res = _db().table("bgu_tracks").select("*").eq("id", profile["track_id"]).execute()
        track = track_res.data[0] if track_res.data else None

        # Get student's courses
        courses_res = (_db().table("student_courses")
                       .select("*")
                       .eq("user_id", user_id)
                       .execute())
        my_courses = courses_res.data or []

        # Calculate
        completed = [c for c in my_courses if c.get("status") == "completed"]
        in_progress = [c for c in my_courses if c.get("status") == "in_progress"]

        completed_credits = sum(c.get("credits", 0) or 0 for c in completed)
        in_progress_credits = sum(c.get("credits", 0) or 0 for c in in_progress)
        total_required = float(track["total_credits"]) if track else 0
        remaining = max(0, total_required - completed_credits)

        # Grade average
        graded = [c for c in completed if c.get("grade") is not None]
        average = None
        if graded:
            total_weighted = sum(c["grade"] * c.get("credits", 1) for c in graded)
            total_weight = sum(c.get("credits", 1) for c in graded)
            average = round(total_weighted / total_weight, 2) if total_weight > 0 else None

        # Recommended per semester
        from datetime import datetime as _dt
        now = _dt.now()
        remaining_semesters = 1
        if profile.get("expected_end"):
            end_year = profile["expected_end"]
            remaining_semesters = max(1, (end_year - now.year) * 2 + (1 if now.month <= 7 else 0))
        recommended = round(remaining / remaining_semesters, 1) if remaining > 0 else 0

        return jsonify({
            "status": "success",
            "total_required": total_required,
            "completed_credits": completed_credits,
            "in_progress_credits": in_progress_credits,
            "remaining": remaining,
            "remaining_semesters": remaining_semesters,
            "recommended_per_semester": recommended,
            "average": average,
            "courses_completed": len(completed),
            "courses_in_progress": len(in_progress),
        })
    except Exception as e:
        logger.error(f"[catalog] credits: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
