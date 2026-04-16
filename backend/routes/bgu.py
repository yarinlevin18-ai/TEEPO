"""
BGU Routes - חיבור לאתרי אוניברסיטת בן-גוריון
"""
import threading
from flask import Blueprint, request, jsonify
from services import bgu_scraper
from config import BGU_USERNAME, BGU_PASSWORD

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
    """Check if sessions are still valid. Checks in-memory state, Supabase cookies, then live session."""
    def _is_connected(site: str) -> bool:
        # 1. In-memory (current server session)
        if _login_status[site] == "connected":
            return True
        # 2. Supabase bgu_sessions table (persists across restarts)
        try:
            from services.supabase_client import get_client
            result = get_client().table("bgu_sessions").select("site").eq("site", site).execute()
            if result.data:
                _login_status[site] = "connected"
                return True
        except Exception:
            pass
        # 3. Live cookie validation (slowest, last resort)
        return bgu_scraper.is_session_valid(site)

    moodle_ok = _is_connected("moodle")
    portal_ok = _is_connected("portal")
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
    SERVER mode: accepts {username, password} and logs in headlessly.
    LOCAL mode:  opens a visible Chrome window for manual login.
    """
    if site not in ("moodle", "portal"):
        return jsonify({"error": "אתר לא ידוע"}), 400

    body = request.get_json() or {}
    # Use body credentials first, fall back to env vars (so no form is needed)
    username = body.get("username") or BGU_USERNAME
    password = body.get("password") or BGU_PASSWORD

    _login_status[site] = "opening"

    if bgu_scraper.IS_SERVER:
        # Cloud: headless login with credentials
        if not username or not password:
            _login_status[site] = "failed"
            return jsonify({"error": "נדרשים שם משתמש וסיסמה — הגדר BGU_USERNAME/BGU_PASSWORD ב-Render"}), 400

        def _do_headless():
            _login_status[site] = "waiting_for_login"
            result = bgu_scraper.login_headless(site, username, password)
            _login_status[site] = "connected" if result["status"] == "success" else "failed"

        thread = threading.Thread(target=_do_headless, daemon=True)
        thread.start()
        return jsonify({"status": "logging_in", "message": "מתחבר עם הפרטים..."})

    else:
        # Local: open visible browser window
        def _do_login():
            _login_status[site] = "waiting_for_login"
            result = bgu_scraper.open_browser_for_login(site)
            _login_status[site] = "connected" if result["status"] == "success" else "failed"

        thread = threading.Thread(target=_do_login, daemon=True)
        thread.start()
        return jsonify({"status": "opening_browser", "message": "פותח דפדפן Chrome..."})


@bgu.get("/mode")
def get_mode():
    """Tell the frontend whether we're in server or local mode."""
    return jsonify({"server_mode": bgu_scraper.IS_SERVER})


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

@bgu.post("/cookies")
def receive_cookies():
    """Receive cookies from the Chrome extension and store them."""
    body = request.get_json() or {}
    site = body.get("site", "")
    cookies = body.get("cookies", [])

    if site not in ("moodle", "portal") or not cookies:
        return jsonify({"status": "error", "message": "נתונים חסרים"}), 400

    try:
        bgu_scraper._save_cookies_to_store(site, cookies)
        _login_status[site] = "connected"
        return jsonify({"status": "success", "message": f"{len(cookies)} cookies נשמרו עבור {site}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@bgu.post("/sync")
def sync_all():
    """Sync all BGU data into the app."""
    user_id = _user_id()
    try:
        from agents.bgu_sync_agent import BGUSyncAgent
        agent = BGUSyncAgent()
        result = agent.execute({"action": "sync_all", "user_id": user_id})
        return jsonify(result)
    except Exception as e:
        import traceback
        print(f"[sync] ERROR: {traceback.format_exc()}")
        return jsonify({"status": "error", "message": f"שגיאה בסנכרון: {str(e)}"}), 500


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
