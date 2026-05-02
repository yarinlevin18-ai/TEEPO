"""Exam group routes: create, join, share, Q&A. Spec §3.5.

All group reads/writes go through Supabase with RLS — backend only carries the
authenticated user's JWT through. No service-key shortcuts that bypass RLS.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from flask import Blueprint, g, jsonify, request

from ..services import moderation

# Supabase is imported lazily so the standalone exam_app can boot without it.
# Group routes still require it at request time — we surface a clear 503 if
# the package is missing or env vars are unset.
if TYPE_CHECKING:
    from supabase import Client

group_bp = Blueprint("group", __name__)

UNIVERSITY_DOMAINS = {
    "post.bgu.ac.il": "BGU", "@bgu.ac.il": "BGU",
    "mail.tau.ac.il": "TAU", "tauex.tau.ac.il": "TAU",
}


def _supabase_for_user(jwt: str) -> "Client":
    """Create a Supabase client bound to the user's JWT so RLS applies."""
    try:
        from supabase import create_client
    except ImportError as e:  # pragma: no cover
        raise RuntimeError(
            "supabase package is not installed; group routes are disabled. "
            "Run `pip install supabase` to enable them."
        ) from e

    url = os.environ.get("SUPABASE_URL")
    anon = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not anon:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set for group routes."
        )
    client = create_client(url, anon)
    client.postgrest.auth(jwt)
    return client


def _detect_university(email: str) -> str | None:
    for domain, uni in UNIVERSITY_DOMAINS.items():
        if email.endswith(domain) or domain in email:
            return uni
    return None


@group_bp.before_request
def require_auth():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"error": "unauthenticated"}), 401
    g.jwt = auth.removeprefix("Bearer ")


def _try_supabase(jwt: str):
    try:
        return _supabase_for_user(jwt), None
    except RuntimeError as e:
        return None, (jsonify({"error": str(e)}), 503)


@group_bp.post("/")
def create_group():
    body: dict[str, Any] = request.get_json(force=True)
    email: str = body["creator_email"]
    university = _detect_university(email)
    if university is None:
        return jsonify({"error": "non-university email"}), 403

    sb, err = _try_supabase(g.jwt)
    if err:
        return err
    res = sb.table("exam_groups").insert({
        "name": body["name"],
        "exam_id_ref": body["exam_id_ref"],
        "course_id_ref": body["course_id_ref"],
        "university": university,
        "max_members": min(body.get("max_members", 8), 25),
        "is_open": bool(body.get("is_open", True)),
    }).execute()
    return jsonify(res.data[0]), 201


@group_bp.post("/<group_id>/join")
def join_group(group_id: str):
    sb, err = _try_supabase(g.jwt)
    if err:
        return err
    res = sb.table("exam_group_members").insert({
        "group_id": group_id,
        "role": "member",
        "status": "active",
    }).execute()
    return jsonify(res.data[0])


@group_bp.post("/<group_id>/messages")
def post_message(group_id: str):
    body = request.get_json(force=True)
    flagged = moderation.check(body["content"])
    if flagged.blocked:
        return jsonify({"error": "blocked", "reason": flagged.reason}), 422

    sb, err = _try_supabase(g.jwt)
    if err:
        return err
    res = sb.table("group_messages").insert({
        "group_id": group_id,
        "content": body["content"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return jsonify(res.data[0]), 201
