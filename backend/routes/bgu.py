"""
BGU Routes - חיבור לאתרי אוניברסיטת בן-גוריון
"""
import threading
from flask import Blueprint, request, jsonify
from services import bgu_scraper
from orchestrator_wrapper import get_orchestrator

bgu = Blueprint("bgu", __name__, url_prefix="/api/bgu")

# Track login progress
_login_status: dict = {"moodle": "idle", "portal": "idle"}


def _user_id():
    return request.headers.get("X-User-Id", "dev-user")


# ------------------------------------------------------------------ #
#  Connection status                                                   #
# ------------------------------------------------------------------ #

@bgu.get("/status")
def connection_status():
    """Check if sessions are still valid."""
    # If we just connected this session, trust _login_status over cookie check
    moodle_ok = (_login_status["moodle"] == "connected") or bgu_scraper.is_session_valid("moodle")
    portal_ok = (_login_status["portal"] == "connected") or bgu_scraper.is_session_valid("portal")
    return jsonify({
        "moodle": moodle_ok,
        "portal": portal_ok,
        "login_status": _login_status,
    })


# ------------------------------------------------------------------ #
#  Login (opens browser window for user to log in)                    #
# ------------------------------------------------------------------ #

@bgu.post("/connect/<site>")
def connect_site(site: str):
    """
    Opens a browser window for the user to log in.
    Runs in background thread so the API returns immediately.
    """
    if site not in ("moodle", "portal"):
        return jsonify({"error": "אתר לא ידוע"}), 400

    _login_status[site] = "opening"

    def _do_login():
        _login_status[site] = "waiting_for_login"
        result = bgu_scraper.open_browser_for_login(site)
        _login_status[site] = "connected" if result["status"] == "success" else "failed"

    thread = threading.Thread(target=_do_login, daemon=True)
    thread.start()

    return jsonify({
        "status": "opening_browser",
        "message": f"פותח דפדפן לכניסה ל-{site}. אנא התחבר בדפדפן שנפתח."
    })


@bgu.get("/connect/<site>/poll")
def poll_login(site: str):
    """Frontend polls this to check if login completed."""
    status = _login_status.get(site, "idle")
    return jsonify({
        "status": status,
        "connected": status == "connected",
    })


# ------------------------------------------------------------------ #
#  Sync                                                                #
# ------------------------------------------------------------------ #

@bgu.post("/sync")
def sync_all():
    """Sync all BGU data into the app."""
    user_id = _user_id()
    orch = get_orchestrator()
    result = orch._execute_agent("bgu_sync", {"action": "sync_all", "user_id": user_id})
    return jsonify(result)


@bgu.get("/courses")
def get_bgu_courses():
    """Get live course list from Moodle."""
    result = bgu_scraper.scrape_moodle_courses()
    return jsonify(result)


@bgu.get("/schedule")
def get_schedule():
    """Get schedule from portal."""
    result = bgu_scraper.scrape_portal_schedule()
    return jsonify(result)


@bgu.post("/assignments")
def get_course_assignments():
    body = request.get_json() or {}
    course_url = body.get("course_url", "")
    if not course_url:
        return jsonify({"error": "חסרה כתובת קורס"}), 400
    result = bgu_scraper.scrape_course_assignments(course_url)
    return jsonify(result)


@bgu.post("/materials")
def get_course_materials():
    body = request.get_json() or {}
    course_url = body.get("course_url", "")
    if not course_url:
        return jsonify({"error": "חסרה כתובת קורס"}), 400
    result = bgu_scraper.scrape_course_materials(course_url)
    return jsonify(result)
