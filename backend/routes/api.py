"""REST API routes for the study platform."""
from flask import Blueprint, request, jsonify
from orchestrator_wrapper import get_orchestrator
from services import supabase_client as db
import uuid

api = Blueprint("api", __name__, url_prefix="/api")


def _user_id():
    """Extract user_id from Authorization header (JWT sub claim)."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        try:
            from jose import jwt as _jwt
            payload = _jwt.get_unverified_claims(token)
            return payload.get("sub", "anonymous")
        except Exception:
            pass
    # dev fallback
    return request.headers.get("X-User-Id", "dev-user")


# ------------------------------------------------------------------ #
#  Courses                                                             #
# ------------------------------------------------------------------ #

@api.get("/courses")
def list_courses():
    result = db.get_courses(_user_id())
    return jsonify(result.data)


@api.post("/courses/extract")
def extract_course():
    body = request.get_json() or {}
    url = body.get("url", "")
    if not url:
        return jsonify({"error": "חסרה כתובת URL"}), 400

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
    date = request.args.get("date")
    result = db.get_tasks(_user_id(), date)
    return jsonify(result.data)


@api.post("/tasks")
def create_task():
    body = request.get_json() or {}
    body["id"] = str(uuid.uuid4())
    body["user_id"] = _user_id()
    result = db.create_task(body)
    return jsonify(result.data[0] if result.data else body), 201


@api.patch("/tasks/<task_id>")
def update_task(task_id):
    body = request.get_json() or {}
    result = db.update_task(task_id, body)
    return jsonify(result.data[0] if result.data else {})


@api.delete("/tasks/<task_id>")
def delete_task(task_id):
    db.delete_task(task_id)
    return jsonify({"ok": True})


# ------------------------------------------------------------------ #
#  Assignments                                                         #
# ------------------------------------------------------------------ #

@api.get("/assignments")
def list_assignments():
    result = db.get_assignments(_user_id())
    return jsonify(result.data)


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
    courses = body.get("courses", [])
    deadline = body.get("deadline", "")
    hours_per_week = body.get("hours_per_week", 10)

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
    content = body.get("content", "")
    title = body.get("title", "")
    if not content:
        return jsonify({"error": "חסר תוכן שיעור"}), 400

    orch = get_orchestrator()
    result = orch.summarize_lesson(content, title)
    return jsonify(result)


@api.post("/lessons/quiz")
def generate_quiz():
    body = request.get_json() or {}
    lesson_text = body.get("content", "")
    num_questions = body.get("num_questions", 10)
    if not lesson_text:
        return jsonify({"error": "חסר תוכן שיעור"}), 400

    orch = get_orchestrator()
    result = orch.generate_quiz(lesson_text, num_questions)
    return jsonify(result)
