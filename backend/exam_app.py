"""Standalone Flask app for /exam routes.

The full app.py boots all of TEEPO (Moodle scraper, orchestrator agents, supabase
client) which has heavy native deps. For local development of just the TEEPO Exam
module, this entry point loads only the `exam_prep` blueprint so you can iterate
on Claude-backed routes without installing the entire requirements.txt.

Run:
    cd backend
    .venv/Scripts/python exam_app.py

It mounts under /exam — same paths as the production app — and CORS-allows
http://localhost:3001 so the dev frontend can call it directly.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

load_dotenv()

from exam_prep import register as register_exam  # noqa: E402

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB — plenty for past-exam PDFs

CORS(
    app,
    origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    supports_credentials=False,
)

# Mount the exam blueprint under /exam (same as production).
register_exam(app)


@app.get("/health")
def health() -> tuple[dict, int]:
    return (
        {
            "ok": True,
            "module": "exam_prep_only",
            "anthropic_key_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
        },
        200,
    )


@app.get("/")
def index() -> tuple[dict, int]:
    return jsonify(
        {
            "name": "TEEPO Exam (standalone)",
            "endpoints": [
                "POST /exam/plan/topics",
                "POST /exam/plan/build",
                "POST /exam/plan/<id>/day/<date>/complete",
                "POST /exam/practice/generate",
                "POST /exam/practice/evaluate",
                "POST /exam/simulation/parse",
                "POST /exam/simulation/<id>/submit",
                "GET  /health",
            ],
        }
    ), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
