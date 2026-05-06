"""Auth helpers — Google provider-token rotation + encrypted refresh-token storage.

Supabase hands out a Google `provider_token` + `provider_refresh_token` at
sign-in but does NOT auto-refresh the provider token. Once it expires
(~1 hour), Drive and Calendar calls start failing with 401. The frontend
calls /api/auth/refresh-google to swap the long-lived refresh token for a
fresh access token.

Storage model — two endpoints
=============================
1. POST /api/auth/store-google-refresh
       Headers: Authorization: Bearer <supabase_jwt>
       Body:    { "refresh_token": "1//0e..." }
   Encrypts the refresh token (services/token_crypto.py, AES-256-GCM)
   and upserts it into `user_google_tokens` keyed by user_id. The frontend
   calls this once at sign-in so future devices can refresh without an
   OAuth round-trip.

2. POST /api/auth/refresh-google
       Headers: Authorization: Bearer <supabase_jwt>   (preferred)
       Body:    {} | { "refresh_token": "1//0e..." }   (legacy)
   Resolution order:
     a. body.refresh_token if present (legacy frontend path — kept alive
        so the existing client doesn't break the day this lands).
     b. Authorization JWT → look up user_google_tokens row → decrypt.
     c. neither → 400.
"""
import httpx
from flask import Blueprint, request, jsonify

from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, logger
from services import supabase_client
from services.token_crypto import encrypt, decrypt, InvalidToken

auth = Blueprint("auth", __name__, url_prefix="/api/auth")

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Name of the table created by migrate_005.sql. Centralised so a rename
# only touches this file.
_TOKEN_TABLE = "user_google_tokens"


def _user_id_from_jwt() -> str | None:
    """Extract user_id from the Authorization header.

    Mirrors `routes.api._user_id` but inlined to avoid the module-level
    token cache there (we want fresh JWT verification on auth-critical
    paths). Returns None on any failure — callers map that to 401.
    """
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    try:
        client = supabase_client.get_client()
        resp = client.auth.get_user(token)
        if resp and resp.user:
            return resp.user.id
    except Exception as e:  # noqa: BLE001 — Supabase raises a wide variety
        logger.debug(f"[auth] JWT verification failed: {e}")
    return None


@auth.post("/store-google-refresh")
def store_google_refresh():
    """Encrypt + persist the user's Google refresh token, keyed by user_id.

    Idempotent: re-calling with a fresh token rotates the stored value.
    Returns 401 if the JWT can't be verified, 400 if the body is missing
    a refresh_token, 500 if the DB write fails.
    """
    user_id = _user_id_from_jwt()
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(silent=True) or {}
    refresh_token = (body.get("refresh_token") or "").strip()
    if not refresh_token:
        return jsonify({"error": "missing_refresh_token"}), 400

    try:
        ciphertext, iv = encrypt(refresh_token)
    except Exception as e:  # noqa: BLE001
        logger.error(f"[auth/store-google-refresh] encryption failed: {e}")
        return jsonify({"error": "encrypt_failed"}), 500

    try:
        client = supabase_client.get_client()
        client.table(_TOKEN_TABLE).upsert({
            "user_id": user_id,
            "ciphertext": ciphertext,
            "iv": iv,
        }, on_conflict="user_id").execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f"[auth/store-google-refresh] DB upsert failed: {e}")
        return jsonify({"error": "storage_failed"}), 500

    return jsonify({"stored": True})


def _lookup_stored_refresh_token(user_id: str) -> str | None:
    """Read + decrypt the stored refresh token for `user_id`.

    Returns None when there's no row OR the row failed authentication
    (which shouldn't happen with a valid key — caller should treat both
    cases as "no stored token"). Logs the auth-failure case loudly so
    monitoring can pick it up — that's a sign of FLASK_SECRET_KEY rotation.
    """
    try:
        client = supabase_client.get_client()
        res = (
            client.table(_TOKEN_TABLE)
            .select("ciphertext, iv")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        logger.error(f"[auth] DB lookup for refresh token failed: {e}")
        return None

    rows = getattr(res, "data", None) or []
    if not rows:
        return None

    row = rows[0]
    try:
        return decrypt(row["ciphertext"], row["iv"])
    except InvalidToken as e:
        logger.error(
            f"[auth] stored token for user {user_id[:8]}... failed auth: {e}. "
            "FLASK_SECRET_KEY rotation? User must re-OAuth."
        )
        return None
    except Exception as e:  # noqa: BLE001
        logger.error(f"[auth] decrypt error: {e}")
        return None


@auth.post("/refresh-google")
def refresh_google_token():
    """Exchange a Google OAuth refresh_token for a fresh access_token.

    Resolution order for the refresh token:
      1. body.refresh_token   (legacy frontend path, kept for backward compat)
      2. JWT → user_google_tokens lookup
      3. 400 missing_refresh_token
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return jsonify({
            "error": "server_not_configured",
            "message": "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set on backend",
        }), 500

    body = request.get_json(silent=True) or {}
    refresh_token = (body.get("refresh_token") or "").strip()

    if not refresh_token:
        # JWT-based fallback — server-stored credentials.
        user_id = _user_id_from_jwt()
        if user_id:
            stored = _lookup_stored_refresh_token(user_id)
            if stored:
                refresh_token = stored

    if not refresh_token:
        return jsonify({"error": "missing_refresh_token"}), 400

    try:
        resp = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=10.0,
        )
    except httpx.RequestError as e:
        logger.error(f"[auth/refresh-google] HTTP error: {e}")
        return jsonify({"error": "upstream_unreachable", "message": str(e)}), 502

    if resp.status_code != 200:
        # Common case: refresh token was revoked (user signed out from Google,
        # changed password, or too long since last use). Frontend should trigger
        # a fresh sign-in flow.
        logger.warning(f"[auth/refresh-google] Google returned {resp.status_code}: {resp.text[:200]}")
        try:
            detail = resp.json()
        except ValueError:
            detail = {"raw": resp.text[:200]}
        return jsonify({
            "error": "refresh_failed",
            "status": resp.status_code,
            "detail": detail,
        }), 401

    data = resp.json()
    # Google responses: {access_token, expires_in, scope, token_type, id_token?}
    return jsonify({
        "access_token": data.get("access_token"),
        "expires_in": data.get("expires_in", 3600),
        "scope": data.get("scope", ""),
        "token_type": data.get("token_type", "Bearer"),
    })
