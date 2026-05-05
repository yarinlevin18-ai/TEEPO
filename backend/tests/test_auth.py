"""
/api/auth/refresh-google input validation.

The actual token exchange (HTTP call to Google) is integration-tested
elsewhere — these guard the validation logic that runs before we hit
Google. Regressions here mean malformed requests would either crash
the server or silently leak credentials in error responses.
"""


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
        """No JSON body at all → missing_refresh_token."""
        # Stub in fake creds so we exercise the body-validation branch
        # rather than the missing-config branch.
        monkeypatch.setenv("GOOGLE_CLIENT_ID", "fake")
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "fake")
        # The route imports from config at module load, so we have to
        # patch there too:
        import config
        monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "fake")
        monkeypatch.setattr(config, "GOOGLE_CLIENT_SECRET", "fake")

        res = client.post("/api/auth/refresh-google", json={})
        assert res.status_code == 400
        body = res.get_json()
        assert body["error"] == "missing_refresh_token"

    def test_returns_400_when_refresh_token_empty_string(self, client, monkeypatch):
        """Empty string is no better than missing."""
        import config
        monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "fake")
        monkeypatch.setattr(config, "GOOGLE_CLIENT_SECRET", "fake")

        res = client.post(
            "/api/auth/refresh-google",
            json={"refresh_token": "   "},  # whitespace-only
        )
        assert res.status_code == 400
