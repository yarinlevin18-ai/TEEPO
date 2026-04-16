"""Supabase client wrapper."""
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

# ── Compatibility patch ─────────────────────────────────────────────────────
# supabase-py 2.3 passes 'proxy' to httpx.Client which removed it in >=0.24.
# Monkey-patch both sync and async httpx clients to silently drop the kwarg.
try:
    import httpx as _httpx

    _orig_sync = _httpx.Client.__init__
    def _sync_init(self, *a, **kw):
        kw.pop('proxy', None)
        _orig_sync(self, *a, **kw)
    _httpx.Client.__init__ = _sync_init

    _orig_async = _httpx.AsyncClient.__init__
    def _async_init(self, *a, **kw):
        kw.pop('proxy', None)
        _orig_async(self, *a, **kw)
    _httpx.AsyncClient.__init__ = _async_init
    print("[supabase_client] httpx proxy compatibility patch applied successfully")
except ImportError:
    pass  # if httpx isn't installed, supabase will fail anyway
except Exception as e:
    print(f"[supabase_client] httpx monkey-patch failed: {e}")
# ───────────────────────────────────────────────────────────────────────────

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "Supabase credentials missing. "
                "Add SUPABASE_URL and SUPABASE_SERVICE_KEY to backend/.env"
            )
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


# --- Courses ---

def get_courses(user_id: str):
    return get_client().table("courses").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()


def create_course(data: dict):
    return get_client().table("courses").insert(data).execute()


def update_course(course_id: str, data: dict):
    return get_client().table("courses").update(data).eq("id", course_id).execute()


# --- Lessons ---

def get_lessons(course_id: str):
    return get_client().table("lessons").select("*").eq("course_id", course_id).order("order_index").execute()


def create_lesson(data: dict):
    return get_client().table("lessons").insert(data).execute()


def bulk_create_lessons(lessons: list):
    return get_client().table("lessons").insert(lessons).execute()


# --- Tasks ---

def get_tasks(user_id: str, date: str | None = None):
    q = get_client().table("study_tasks").select("*").eq("user_id", user_id)
    if date:
        q = q.eq("scheduled_date", date)
    return q.order("scheduled_date").execute()


def create_task(data: dict):
    return get_client().table("study_tasks").insert(data).execute()


def update_task(task_id: str, data: dict):
    return get_client().table("study_tasks").update(data).eq("id", task_id).execute()


def delete_task(task_id: str):
    return get_client().table("study_tasks").delete().eq("id", task_id).execute()


# --- Assignments ---

def get_assignments(user_id: str):
    return get_client().table("assignments").select("*, assignment_tasks(*)").eq("user_id", user_id).order("deadline").execute()


def create_assignment(data: dict):
    return get_client().table("assignments").insert(data).execute()


def create_assignment_tasks(tasks: list):
    return get_client().table("assignment_tasks").insert(tasks).execute()


# --- Conversations ---

def save_conversation(data: dict):
    return get_client().table("agent_conversations").insert(data).execute()


def get_conversations(user_id: str, agent_type: str = "study_buddy"):
    return (
        get_client()
        .table("agent_conversations")
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_type", agent_type)
        .order("last_message_at", desc=True)
        .limit(1)
        .execute()
    )


def update_conversation(conv_id: str, data: dict):
    return get_client().table("agent_conversations").update(data).eq("id", conv_id).execute()
