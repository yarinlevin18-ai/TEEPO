"""Auth helpers — specifically, rotating Google provider access tokens.

Supabase hands out a Google `provider_token` + `provider_refresh_token` at sign-in,
but it does NOT auto-refresh the provider token. Once it expires (~1 hour), Drive
and Calendar calls start failing with 401. This endpoint exchanges the long-lived
refresh token for a new access token by calling Google's OAuth token endpoint
with our server-side client secret.

Route: POST /api/auth/refresh-google
Body:  {"refresh_token": "1//0e..."}
Returns: {"access_token": "ya29...", "expires_in": 3599, "scope": "..."}
"""
import httpx
from flask import Blueprint, request, jsonify

from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, logger

auth = Blueprint("auth", __name__, url_prefix="/api/auth")

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


@auth.post("/refresh-google")
def refresh_google_token():
    """Exchange a Google OAuth refresh_token for a fresh access_token.

    The refresh token itself never leaves the browser's localStorage + this server;
    it is NOT stored in our database. The client holds it, sends it here when the
    access token is near expiry, and gets back a fresh access token.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return jsonify({
            "error": "server_not_configured",
            "message": "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set on backend",
        }), 500

    body = request.get_json(silent=True) or {}
    refresh_token = body.get("refresh_token", "").strip()
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
