"""
אפליקציית הלמידה - שרת Flask עם WebSocket
מפעיל את כל ה-API routes ואת הצ'אט בזמן אמת.
"""
import os
import time as _time
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

from config import FLASK_SECRET_KEY, FLASK_ENV, IS_PRODUCTION, BGU_USERNAME, BGU_PASSWORD, logger
from routes.api import api
from routes.bgu import bgu, _login_status
from routes.catalog import catalog
from routes.websocket import register_socket_events

_start_time = _time.time()

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY

# CORS — restrict to known origins in production
_allowed_origins = [
    "https://bgu-study-organizer.vercel.app",
    "https://*.vercel.app",
    "http://localhost:3000",
    "http://localhost:5000",
]
CORS(app, origins=_allowed_origins if FLASK_ENV == "production" else "*", supports_credentials=False)


@app.after_request
def add_security_headers(response):
    """Add security headers to all responses."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

socketio = SocketIO(
    app,
    cors_allowed_origins=_allowed_origins if IS_PRODUCTION else "*",
    async_mode="threading",
    logger=FLASK_ENV == "development",
    engineio_logger=False,
)

# Register REST routes
app.register_blueprint(api)
app.register_blueprint(bgu)
app.register_blueprint(catalog)

# Register WebSocket events
register_socket_events(socketio)


@app.get("/health")
def health():
    checks = {}

    # Supabase
    try:
        from services import supabase_client as db
        db.get_client().table("courses").select("id").limit(1).execute()
        checks["supabase"] = "connected"
    except Exception as e:
        checks["supabase"] = f"error: {e}"
        logger.warning(f"Health check — Supabase error: {e}")

    # Claude API (lightweight key check, no actual call)
    from config import ANTHROPIC_API_KEY
    checks["claude_api"] = "configured" if ANTHROPIC_API_KEY else "missing_key"

    # Orchestrator
    from orchestrator_wrapper import get_orchestrator
    try:
        orch = get_orchestrator()
        agent_count = len(getattr(orch, "_local_agents", {}))
        checks["orchestrator"] = f"ok ({agent_count} agents)"
    except Exception as e:
        checks["orchestrator"] = f"error: {e}"

    all_ok = checks["supabase"] == "connected" and checks["claude_api"] == "configured"
    uptime = int(_time.time() - _start_time)

    return {
        "status": "ok" if all_ok else "degraded",
        "checks": checks,
        "uptime_seconds": uptime,
        "environment": FLASK_ENV,
        "message": "שרת הלמידה פעיל",
    }


@app.get("/api/setup-db")
def setup_db():
    """Instructions for creating Supabase tables + env var check."""
    from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")

    project_ref = ""
    if SUPABASE_URL:
        project_ref = SUPABASE_URL.replace("https://", "").split(".")[0]

    return {
        "status": "manual_required",
        "env_vars": {
            "SUPABASE_URL": "✓ set" if SUPABASE_URL else "✗ MISSING",
            "SUPABASE_SERVICE_KEY": "✓ set" if SUPABASE_SERVICE_KEY else "✗ MISSING",
        },
        "missing": missing,
        "sql_editor_url": f"https://supabase.com/dashboard/project/{project_ref}/sql/new" if project_ref else "unknown",
        "instructions": "Copy backend/create_tables.sql and run it in the Supabase SQL editor link above",
    }


def _auto_login_on_startup():
    """If BGU credentials are set as env vars, auto-login on startup."""
    import time
    from services import bgu_scraper
    if not (BGU_USERNAME and BGU_PASSWORD and bgu_scraper.IS_SERVER):
        return
    time.sleep(5)  # wait for server to be ready
    for site in ("moodle", "portal"):
        try:
            logger.info(f"Auto-login: connecting to {site}...")
            result = bgu_scraper.login_headless(site, BGU_USERNAME, BGU_PASSWORD)
            _login_status[site] = "connected" if result.get("status") == "success" else "failed"
            logger.info(f"Auto-login {site}: {_login_status[site]}")
        except Exception as e:
            logger.error(f"Auto-login {site} failed: {e}")
            _login_status[site] = "failed"


import threading as _threading
_threading.Thread(target=_auto_login_on_startup, daemon=True).start()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info(f"Starting study server on port {port} (env={FLASK_ENV})...")
    socketio.run(app, host="0.0.0.0", port=port, debug=FLASK_ENV == "development", allow_unsafe_werkzeug=True)
