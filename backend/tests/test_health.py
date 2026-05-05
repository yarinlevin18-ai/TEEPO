"""
/health endpoint smoke test.

This is the route Render's keep-alive workflow pings (#44). If it
regresses, the keep-alive starts failing silently and we won't notice
until the dyno spins down.
"""


class TestHealth:
    def test_health_returns_200_with_supabase_connected(self, client):
        """Happy path — Supabase reachable, Anthropic key configured."""
        res = client.get("/health")
        assert res.status_code == 200
        body = res.get_json()
        assert body["status"] in {"ok", "degraded"}
        # Always present — drives the dashboard wakeup banner.
        assert "checks" in body
        assert "uptime_seconds" in body

    def test_health_reports_supabase_connected_when_query_succeeds(self, client):
        """When Supabase query returns without error, status reads 'connected'."""
        res = client.get("/health")
        body = res.get_json()
        assert body["checks"]["supabase"] == "connected"

    def test_health_reports_claude_api_configured_when_env_set(self, client):
        """The conftest sets ANTHROPIC_API_KEY — this asserts the readiness check sees it."""
        res = client.get("/health")
        body = res.get_json()
        assert body["checks"]["claude_api"] == "configured"

    def test_health_returns_quickly(self, client):
        """The route must be cheap — keep-alive pings every 13 minutes
        and Render starts billing after 90s. Anything > 1s is suspicious."""
        import time
        t0 = time.perf_counter()
        client.get("/health")
        elapsed = time.perf_counter() - t0
        assert elapsed < 1.0, f"/health took {elapsed:.2f}s — should be <1s"
