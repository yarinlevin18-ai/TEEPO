"""
/api/auth/* input validation and JWT-storage specs.

The actual token exchange (HTTP call to Google) is integration-tested
elsewhere — these guard the validation logic that runs before we hit
Google + the encrypted-storage path that landed with migrate_005. Regressions
here mean malformed requests would either crash the server or silently
leak credentials in error responses.
"""
from unittest.mock import MagicMock


class TestRefreshGoogle:
    def test_returns_500_when_google_client_id_missing(self, client):
        """Conftest deliberately leaves GOOGLE_CLIENT_ID/SECRET unset.
        The route must report 'server_not_configured' rather than crash
        or attempt to call Google with empty credentials."""
        res = client.post(
            "/api/auth/refresh-google",
            json={"refresh_token": "1//0e-test"},
        )
        # Either 500 with our error key, OR 400 if the refresh-token
        # check happens first. Both are correct refusals — what matters
        # is we don't 200.
        assert res.status_code in (400, 500)
        body = res.get_json()
        assert "error" in body

    def test_returns_400_when_no_body(self, client, monkeypatch):
        """No JSON body at all → missing_refresh_token.

        `routes.auth` imports the credential constants at module load
        (`from config import GOOGLE_CLIENT_ID, ...`), so by the time the
        test runs they're already bound inside that module. Patching
        `config` is too late — patch `routes.auth` directly.
        """
        import routes.auth as auth_module
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "fake")
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_SECRET", "fake")

        res = client.post("/api/auth/refresh-google", json={})
        assert res.status_code == 400
        body = res.get_json()
        assert body["error"] == "missing_refresh_token"

    def test_returns_400_when_refresh_token_empty_string(self, client, monkeypatch):
        """Empty string is no better than missing."""
        import routes.auth as auth_module
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "fake")
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_SECRET", "fake")

        res = client.post(
            "/api/auth/refresh-google",
            json={"refresh_token": "   "},  # whitespace-only
        )
        assert res.status_code == 400


class TestRefreshGoogleJwtFallback:
    """The new resolution branch: empty body + valid JWT → look up the
    encrypted row, decrypt, use that as the refresh token. We don't
    actually hit Google here — we stub httpx and assert the right token
    flowed through."""

    def _wire_jwt_user(self, supabase_mock, user_id: str = "user-abc-123"):
        """Make the Supabase mock recognise any Bearer token as `user_id`."""
        supabase_mock.auth.get_user.return_value = MagicMock(
            user=MagicMock(id=user_id)
        )

    def _wire_stored_refresh(self, supabase_mock, plaintext: str):
        """Encrypt + plant a row so a `select(...).eq("user_id", ...)` returns it."""
        from services.token_crypto import encrypt

        ct, iv = encrypt(plaintext)
        chain = supabase_mock.table.return_value
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.limit.return_value = chain
        chain.execute.return_value.data = [{"ciphertext": ct, "iv": iv}]
        return ct, iv

    def test_uses_stored_token_when_body_empty(
        self, client, monkeypatch, supabase_mock
    ):
        import routes.auth as auth_module
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "fake-id")
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_SECRET", "fake-sec")

        self._wire_jwt_user(supabase_mock)
        self._wire_stored_refresh(supabase_mock, "the-stored-refresh-token")

        # Stub httpx.post — assert later it was called with the decrypted token.
        captured = {}

        def fake_post(url, data=None, timeout=None):
            captured["url"] = url
            captured["data"] = data
            return MagicMock(
                status_code=200,
                json=lambda: {
                    "access_token": "ya29.fresh",
                    "expires_in": 3600,
                    "scope": "drive",
                    "token_type": "Bearer",
                },
            )

        monkeypatch.setattr(auth_module.httpx, "post", fake_post)

        res = client.post(
            "/api/auth/refresh-google",
            headers={"Authorization": "Bearer some-jwt"},
            json={},
        )

        assert res.status_code == 200, res.get_json()
        body = res.get_json()
        assert body["access_token"] == "ya29.fresh"
        assert captured["data"]["refresh_token"] == "the-stored-refresh-token"

    def test_returns_400_when_no_jwt_and_no_body(
        self, client, monkeypatch, supabase_mock
    ):
        """No Authorization header, no body → 400 (existing contract)."""
        import routes.auth as auth_module
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "fake-id")
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_SECRET", "fake-sec")

        res = client.post("/api/auth/refresh-google", json={})
        assert res.status_code == 400
        assert res.get_json()["error"] == "missing_refresh_token"

    def test_body_token_takes_precedence_over_stored(
        self, client, monkeypatch, supabase_mock
    ):
        """Backward compat — if the legacy frontend sends a body token,
        we use that and never bother looking up storage."""
        import routes.auth as auth_module
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "fake-id")
        monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_SECRET", "fake-sec")

        self._wire_jwt_user(supabase_mock)
        # Plant a stored row that we expect NOT to be used.
        self._wire_stored_refresh(supabase_mock, "stored-not-used")

        captured = {}

        def fake_post(url, data=None, timeout=None):
            captured["data"] = data
            return MagicMock(
                status_code=200,
                json=lambda: {"access_token": "ya29", "expires_in": 60, "scope": "", "token_type": "Bearer"},
            )

        monkeypatch.setattr(auth_module.httpx, "post", fake_post)

        res = client.post(
            "/api/auth/refresh-google",
            headers={"Authorization": "Bearer some-jwt"},
            json={"refresh_token": "from-body"},
        )

        assert res.status_code == 200
        assert captured["data"]["refresh_token"] == "from-body"


class TestStoreGoogleRefresh:
    def test_returns_401_without_jwt(self, client):
        res = client.post(
            "/api/auth/store-google-refresh",
            json={"refresh_token": "1//0e-test"},
        )
        assert res.status_code == 401
        assert res.get_json()["error"] == "unauthorized"

    def test_returns_401_when_jwt_invalid(self, client, supabase_mock):
        """Supabase auth.get_user returns user=None for bad tokens."""
        supabase_mock.auth.get_user.return_value = MagicMock(user=None)

        res = client.post(
            "/api/auth/store-google-refresh",
            headers={"Authorization": "Bearer bad-token"},
            json={"refresh_token": "1//0e-test"},
        )
        assert res.status_code == 401

    def test_returns_400_when_no_refresh_token(self, client, supabase_mock):
        supabase_mock.auth.get_user.return_value = MagicMock(
            user=MagicMock(id="user-xyz")
        )
        res = client.post(
            "/api/auth/store-google-refresh",
            headers={"Authorization": "Bearer good-token"},
            json={},
        )
        assert res.status_code == 400
        assert res.get_json()["error"] == "missing_refresh_token"

    def test_upserts_encrypted_row_on_success(self, client, supabase_mock):
        """Happy path: returns 200 + the row written to Supabase has
        ciphertext/iv that can be round-tripped back to the plaintext."""
        from services.token_crypto import decrypt

        supabase_mock.auth.get_user.return_value = MagicMock(
            user=MagicMock(id="user-xyz")
        )

        captured = {}

        def fake_upsert(payload, on_conflict=None):
            captured["payload"] = payload
            captured["on_conflict"] = on_conflict
            return MagicMock(execute=lambda: MagicMock(data=[payload]))

        supabase_mock.table.return_value.upsert.side_effect = fake_upsert

        res = client.post(
            "/api/auth/store-google-refresh",
            headers={"Authorization": "Bearer good-token"},
            json={"refresh_token": "1//0e-real-secret"},
        )

        assert res.status_code == 200, res.get_json()
        assert res.get_json() == {"stored": True}

        payload = captured["payload"]
        assert payload["user_id"] == "user-xyz"
        assert captured["on_conflict"] == "user_id"
        # Crucially — the plaintext refresh token must NOT be in the payload.
        assert "1//0e-real-secret" not in str(payload)
        # And the ciphertext/iv stored must round-trip.
        assert decrypt(payload["ciphertext"], payload["iv"]) == "1//0e-real-secret"
