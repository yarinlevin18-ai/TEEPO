"""
אפליקציית הלמידה - שרת Flask עם WebSocket
מפעיל את כל ה-API routes ואת הצ'אט בזמן אמת.
"""
import os
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

from config import FLASK_SECRET_KEY, FLASK_ENV, BGU_USERNAME, BGU_PASSWORD
from routes.api import api
from routes.bgu import bgu, _login_status
from routes.websocket import register_socket_events

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY

# Allow all origins — this is a personal app, no sensitive public data
CORS(app, origins="*", supports_credentials=False)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=FLASK_ENV == "development",
    engineio_logger=False,
)

# Register REST routes
app.register_blueprint(api)
app.register_blueprint(bgu)

# Register WebSocket events
register_socket_events(socketio)


@app.get("/health")
def health():
    return {"status": "ok", "message": "שרת הלמידה פעיל"}


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
            print(f"🔐 מתחבר אוטומטית ל-{site}...")
            result = bgu_scraper.login_headless(site, BGU_USERNAME, BGU_PASSWORD)
            _login_status[site] = "connected" if result.get("status") == "success" else "failed"
            print(f"{'✅' if _login_status[site] == 'connected' else '❌'} {site}: {_login_status[site]}")
        except Exception as e:
            print(f"❌ שגיאה בהתחברות אוטומטית ל-{site}: {e}")
            _login_status[site] = "failed"


import threading as _threading
_threading.Thread(target=_auto_login_on_startup, daemon=True).start()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"🚀 מפעיל שרת לימודים על פורט {port}...")
    socketio.run(app, host="0.0.0.0", port=port, debug=FLASK_ENV == "development", allow_unsafe_werkzeug=True)
