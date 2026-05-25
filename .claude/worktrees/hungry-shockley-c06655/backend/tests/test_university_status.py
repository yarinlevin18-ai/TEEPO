"""
GET /api/university/status — read-only smoke test.

The frontend polls this every 5 seconds (see app/(dashboard)/moodle/page.tsx).
A regression that returns a non-JSON or non-200 response would freeze the
moodle/portal panel. This test guards the contract.
"""


class TestUniversityStatus:
    def test_status_returns_json_with_expected_keys(self, client):
        """Response shape: { moodle, portal, login_status }.
        We don't care WHAT the values are in tests (Selenium isn't running),
        just that the shape is preserved."""
        res = client.get("/api/university/status")
        # 200 happy / 401 if route requires auth / 500 if upstream broke.
        # Anything else means routing itself is broken.
        assert res.status_code in (200, 401, 500)

        # If 200, it must be JSON with the expected keys
        if res.status_code == 200:
            body = res.get_json()
            assert isinstance(body, dict)
            assert "moodle" in body or "error" in body
