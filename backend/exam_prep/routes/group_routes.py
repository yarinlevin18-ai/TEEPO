"""Exam group routes: create, join, share, Q&A. Spec §3.5.

All group reads/writes go through Supabase with RLS — backend only carries the
authenticated user's JWT through. No service-key shortcuts that bypass RLS.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from flask import Blueprint, g, jsonify, request
from supabase import Client, create_client

from ..services import moderation

group_bp = Blueprint("group", __name__)

UNIVERSITY_DOMAINS = {
    "post.bgu.ac.il": "BGU", "@bgu.ac.il": "BGU",
    "mail.tau.ac.il": "TAU", "tauex.tau.ac.il": "TAU",
}


def _supabase_for_user(jwt: str) -> Client:
    """Create a Supabase client bound to the user's JWT so RLS applies."""
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
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


@group_bp.post("/")
def create_group():
    body: dict[str, Any] = request.get_json(force=True)
    email: str = body["creator_email"]
    university = _detect_university(email)
    if university is None:
        return jsonify({"error": "non-university email"}), 403

    sb = _supabase_for_user(g.jwt)
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
    sb = _supabase_for_user(g.jwt)
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

    sb = _supabase_for_user(g.jwt)
    res = sb.table("group_messages").insert({
        "group_id": group_id,
        "content": body["content"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return jsonify(res.data[0]), 201
