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
    """Create all required Supabase tables if they don't exist. Safe to run multiple times."""
    from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
    import requests as _req

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {"status": "error", "message": "SUPABASE_URL or SUPABASE_SERVICE_KEY not set in env vars"}, 500

    # Build the project ref from the URL
    # URL format: https://[ref].supabase.co
    project_ref = SUPABASE_URL.replace("https://", "").split(".")[0]

    sql = """
CREATE TABLE IF NOT EXISTS bgu_sessions (
  site        TEXT PRIMARY KEY,
  cookies     TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courses (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id             TEXT NOT NULL DEFAULT 'dev-user',
  title               TEXT NOT NULL,
  source              TEXT DEFAULT 'bgu',
  source_url          TEXT,
  description         TEXT,
  status              TEXT DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id   TEXT REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT,
  ai_summary  TEXT,
  order_index INTEGER DEFAULT 0,
  lesson_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS study_tasks (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        TEXT NOT NULL DEFAULT 'dev-user',
  title          TEXT NOT NULL,
  description    TEXT,
  scheduled_date DATE,
  is_completed   BOOLEAN DEFAULT false,
  priority       TEXT DEFAULT 'medium',
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL DEFAULT 'dev-user',
  course_id   TEXT REFERENCES courses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'todo',
  priority    TEXT DEFAULT 'medium',
  due_date    DATE,
  deadline    DATE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assignment_tasks (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  completed     BOOLEAN DEFAULT false,
  order_index   INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS agent_conversations (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT NOT NULL DEFAULT 'dev-user',
  agent_type      TEXT DEFAULT 'study_buddy',
  messages        JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now()
);
SELECT 'ok' as result;
"""

    try:
        resp = _req.post(
            f"https://{project_ref}.supabase.co/rest/v1/rpc/exec_sql",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"query": sql},
            timeout=30,
        )
        # Also try via management API
        if resp.status_code >= 400:
            # Fallback: run via Supabase pg connection
            return _setup_via_psycopg(project_ref, sql)
        return {"status": "success", "message": "כל הטבלאות נוצרו בהצלחה"}
    except Exception as e:
        return _setup_via_psycopg(project_ref, sql)


def _setup_via_psycopg(project_ref, sql):
    """Try direct Postgres connection to run DDL."""
    from config import SUPABASE_SERVICE_KEY
    try:
        import psycopg2
        conn_str = f"postgresql://postgres.{project_ref}:{SUPABASE_SERVICE_KEY}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
        conn = psycopg2.connect(conn_str)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(sql)
        conn.close()
        return {"status": "success", "message": "טבלאות נוצרו דרך Postgres"}
    except Exception as e2:
        return {"status": "error", "message": f"נסיון Postgres נכשל: {str(e2)}"}, 500


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


def _run_setup_on_startup():
    """Auto-create DB tables on first boot."""
    import time, requests as _req
    time.sleep(3)
    try:
        port = int(os.getenv("PORT", 5000))
        r = _req.get(f"http://localhost:{port}/api/setup-db", timeout=30)
        print(f"[DB Setup] {r.json()}")
    except Exception as e:
        print(f"[DB Setup] Warning: {e}")


import threading as _threading
_threading.Thread(target=_auto_login_on_startup, daemon=True).start()
_threading.Thread(target=_run_setup_on_startup, daemon=True).start()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"🚀 מפעיל שרת לימודים על פורט {port}...")
    socketio.run(app, host="0.0.0.0", port=port, debug=FLASK_ENV == "development", allow_unsafe_werkzeug=True)
