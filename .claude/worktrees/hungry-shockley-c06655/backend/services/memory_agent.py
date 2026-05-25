"""
memory_agent.py — Central memory brain for all agents.

Stores typed memories in a global SQLite database (primary) and a JSON file
(human-readable backup). Both live at a user-level path so memories persist
across ALL projects and sessions.

Storage:
    ~/.claude/memory/memory.db    — primary SQLite database
    ~/.claude/memory/memory.json  — JSON backup, kept in sync after every write

Memory types:
    "preference"   — user likes, dislikes, patterns
    "session"      — summary of what happened in a past session
    "agent_output" — results saved by other agents

Public API (import and call directly from any agent):
    save_memory(type, content, source_agent, tags=None)
    get_memories(type=None, limit=10)
    search_memories(query)
    summarize_session(session_data)
    agent_info()
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import anthropic

# ---------------------------------------------------------------------------
# Paths — global, user-level, project-agnostic
# ---------------------------------------------------------------------------

MEMORY_DIR = Path.home() / ".claude" / "memory"
DB_PATH    = MEMORY_DIR / "memory.db"
JSON_PATH  = MEMORY_DIR / "memory.json"

MODEL = "claude-sonnet-4-20250514"

VALID_TYPES = {"preference", "session", "agent_output"}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    """Return current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _init_db() -> None:
    """
    Create MEMORY_DIR and initialize the SQLite schema if not already present.
    Safe to call multiple times — all operations are idempotent.
    """
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                type         TEXT    NOT NULL,
                content      TEXT    NOT NULL,
                source_agent TEXT,
                timestamp    TEXT    NOT NULL,
                tags         TEXT
            )
        """)
        conn.commit()


def _sync_json_backup() -> None:
    """
    Read ALL rows from SQLite and write them to memory.json atomically.
    Uses tempfile + os.replace() so the file is never left in a partial state.
    Called after every write operation.
    """
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, type, content, source_agent, timestamp, tags "
            "FROM memories ORDER BY id"
        ).fetchall()

    memories = [dict(row) for row in rows]

    payload = {
        "last_synced": _now_iso(),
        "count": len(memories),
        "memories": memories,
    }

    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path_str = tempfile.mkstemp(
        dir=MEMORY_DIR, prefix=".memory_", suffix=".json.tmp"
    )
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path_str, JSON_PATH)
    except OSError:
        try:
            os.unlink(tmp_path_str)
        except OSError:
            pass
        raise


# Run once at import time — safe and idempotent
_init_db()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def save_memory(
    type: str,
    content: str,
    source_agent: str,
    tags: Optional[str] = None,
) -> dict[str, Any]:
    """
    Save a new memory to the database.

    Args:
        type:         One of "preference", "session", or "agent_output".
        content:      The memory content (free-form text).
        source_agent: Name of the agent or entity saving this memory.
        tags:         Optional comma-separated tags (e.g. "flask,api,auth").

    Returns:
        {"status": "success", "id": <int>}
        {"status": "error",   "message": <str>}
    """
    try:
        if type not in VALID_TYPES:
            raise ValueError(
                f"Invalid memory type '{type}'. Must be one of: {sorted(VALID_TYPES)}"
            )
        if not content or not content.strip():
            raise ValueError("content must not be empty.")
        if not source_agent or not source_agent.strip():
            raise ValueError("source_agent must not be empty.")

        ts = _now_iso()
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute(
                "INSERT INTO memories (type, content, source_agent, timestamp, tags) "
                "VALUES (?, ?, ?, ?, ?)",
                (type, content.strip(), source_agent.strip(), ts, tags),
            )
            new_id = cursor.lastrowid

        _sync_json_backup()
        return {"status": "success", "id": new_id}

    except Exception as exc:
        return {"status": "error", "message": str(exc)}


def get_memories(
    type: Optional[str] = None,
    limit: int = 10,
) -> dict[str, Any]:
    """
    Retrieve recent memories, newest first.

    Args:
        type:  Optional filter — "preference", "session", or "agent_output".
               If None, all types are returned.
        limit: Maximum number of memories to return (default 10).

    Returns:
        {"status": "success", "memories": [...], "count": <int>}
        {"status": "error",   "message": <str>}
    """
    try:
        if type is not None and type not in VALID_TYPES:
            raise ValueError(
                f"Invalid memory type '{type}'. Must be one of: {sorted(VALID_TYPES)}"
            )

        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            if type is not None:
                rows = conn.execute(
                    "SELECT * FROM memories WHERE type = ? ORDER BY id DESC LIMIT ?",
                    (type, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM memories ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()

        memories = [dict(r) for r in rows]
        return {"status": "success", "memories": memories, "count": len(memories)}

    except Exception as exc:
        return {"status": "error", "message": str(exc)}


def search_memories(query: str) -> dict[str, Any]:
    """
    Search memories by keyword (case-insensitive substring match on content).

    Args:
        query: The keyword or phrase to search for.

    Returns:
        {"status": "success", "memories": [...], "count": <int>}
        {"status": "error",   "message": <str>}
    """
    try:
        if not query or not query.strip():
            raise ValueError("query must not be empty.")

        pattern = f"%{query.strip()}%"
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM memories WHERE content LIKE ? ORDER BY id DESC",
                (pattern,),
            ).fetchall()

        memories = [dict(r) for r in rows]
        return {"status": "success", "memories": memories, "count": len(memories)}

    except Exception as exc:
        return {"status": "error", "message": str(exc)}


def summarize_session(session_data: Any) -> dict[str, Any]:
    """
    Use the Claude API to summarize session data, then save it as a "session" memory.

    Args:
        session_data: A dict or string describing what happened in the session.
                      Dicts are pretty-printed as JSON before sending to Claude.

    Returns:
        {"status": "success", "summary": <str>, "id": <int>}
        {"status": "error",   "message": <str>}
    """
    try:
        # Normalize to a string for the prompt
        if isinstance(session_data, dict):
            context_str = json.dumps(session_data, indent=2, ensure_ascii=False)
        else:
            context_str = str(session_data)

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY environment variable is not set. "
                "Export it before calling summarize_session()."
            )

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Summarize the following session data concisely. "
                        "Focus on: what was accomplished, key decisions made, "
                        "important outputs, and anything worth remembering for "
                        "future sessions. Be specific and factual. "
                        "Keep the summary under 200 words.\n\n"
                        f"Session data:\n{context_str}"
                    ),
                }
            ],
        )

        summary = response.content[0].text.strip()

        # Persist the summary as a "session" memory
        save_result = save_memory(
            type="session",
            content=summary,
            source_agent="memory_agent",
        )

        if save_result["status"] != "success":
            return save_result  # propagate inner error

        return {
            "status": "success",
            "summary": summary,
            "id": save_result["id"],
        }

    except anthropic.APIError as exc:
        return {"status": "error", "message": f"Claude API error: {exc}"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


def agent_info() -> dict[str, Any]:
    """
    Return metadata about this agent so the orchestrator knows how to use it.

    Returns:
        A dict describing the agent's name, version, capabilities, and API surface.
    """
    # Count current memories for informational purposes
    try:
        with sqlite3.connect(DB_PATH) as conn:
            count = conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
    except Exception:
        count = 0

    return {
        "name": "memory_agent",
        "description": (
            "Central memory brain for all agents. Persists typed memories to a "
            "global SQLite database and JSON backup at ~/.claude/memory/. "
            "Supports saving, retrieving, keyword searching, and AI-powered "
            "session summarization. Memories persist across all projects and sessions."
        ),
        "version": "1.0.0",
        "storage": {
            "db":   str(DB_PATH),
            "json": str(JSON_PATH),
        },
        "memory_count": count,
        "memory_types": ["preference", "session", "agent_output"],
        "capabilities": ["store", "retrieve", "search", "summarize"],
        "functions": [
            {
                "name": "save_memory",
                "description": "Save a new memory entry.",
                "args": {
                    "type":         "str — 'preference' | 'session' | 'agent_output'",
                    "content":      "str — the memory content",
                    "source_agent": "str — name of the calling agent",
                    "tags":         "str | None — optional comma-separated tags",
                },
            },
            {
                "name": "get_memories",
                "description": "Retrieve recent memories, newest first.",
                "args": {
                    "type":  "str | None — filter by memory type (default: all)",
                    "limit": "int — max results to return (default: 10)",
                },
            },
            {
                "name": "search_memories",
                "description": "Search memories by keyword (substring match on content).",
                "args": {
                    "query": "str — keyword or phrase to search for",
                },
            },
            {
                "name": "summarize_session",
                "description": (
                    "Use Claude API to summarize session data and save it as a "
                    "'session' memory. Requires ANTHROPIC_API_KEY env var."
                ),
                "args": {
                    "session_data": "dict | str — raw session data to summarize",
                },
            },
        ],
        "model_used": MODEL,
        "requires_api_key": "ANTHROPIC_API_KEY (only for summarize_session)",
    }


# ---------------------------------------------------------------------------
# CLI demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import pprint

    print("=" * 60)
    print("  memory_agent - demo")
    print("=" * 60)
    print(f"\nDB path:   {DB_PATH}")
    print(f"JSON path: {JSON_PATH}\n")

    # 1. save_memory -- one per memory type
    print("-- save_memory() " + "-" * 43)

    print("\n[preference]")
    pprint.pprint(save_memory(
        type="preference",
        content="Use Black for Python formatting with line length 88. "
                "Always include type hints in function signatures.",
        source_agent="user",
        tags="python,formatting,style",
    ))

    print("\n[agent_output]")
    pprint.pprint(save_memory(
        type="agent_output",
        content="Generated a Flask REST API with JWT authentication: "
                "3 blueprints (auth, users, items), 12 routes, SQLAlchemy ORM.",
        source_agent="backend_agent",
        tags="flask,api,jwt,sqlalchemy",
    ))

    print("\n[session]")
    pprint.pprint(save_memory(
        type="session",
        content="Worked on the SmartCut booking system. Completed the admin gallery "
                "page with drag-and-drop image reordering. Backend routes tested.",
        source_agent="orchestrator",
        tags="smartcut,admin,gallery",
    ))

    # 2. get_memories
    print("\n-- get_memories(limit=5) " + "-" * 36)
    pprint.pprint(get_memories(limit=5))

    print("\n-- get_memories(type='preference') " + "-" * 25)
    pprint.pprint(get_memories(type="preference"))

    # 3. search_memories
    print("\n-- search_memories('Flask') " + "-" * 33)
    pprint.pprint(search_memories("Flask"))

    print("\n-- search_memories('SmartCut') " + "-" * 29)
    pprint.pprint(search_memories("SmartCut"))

    # 4. agent_info
    print("\n-- agent_info() " + "-" * 44)
    pprint.pprint(agent_info())

    print("\n" + "=" * 60)
    print("  Demo complete.")
    print("  Tip: set ANTHROPIC_API_KEY and call summarize_session()")
    print("       to test AI-powered session summarization.")
    print("=" * 60)
