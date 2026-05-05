"""
POST /api/grades/manual — input validation.

Manual grade entry is a v2.1 feature (Tzvi's task #5, frontend in #41).
These tests exercise the validation surface — what happens when the
caller sends bad data — without touching the real Supabase upsert.
"""


class TestManualGrade:
    def test_400_when_course_name_missing(self, client):
        """Required field — no course_name, no save."""
        res = client.post("/api/grades/manual", json={"grade": 85})
        assert res.status_code == 400
        assert "error" in res.get_json()

    def test_400_when_no_grade_or_text(self, client):
        """Must provide either numeric grade OR grade_text."""
        res = client.post(
            "/api/grades/manual",
            json={"course_name": "אלגוריתמים"},
        )
        assert res.status_code == 400

    def test_400_when_grade_out_of_range(self, client):
        """Grades are 0-100. Anything else is rejected."""
        res = client.post(
            "/api/grades/manual",
            json={"course_name": "אלגוריתמים", "grade": 105},
        )
        assert res.status_code == 400

        res = client.post(
            "/api/grades/manual",
            json={"course_name": "אלגוריתמים", "grade": -5},
        )
        assert res.status_code == 400

    def test_400_when_credits_out_of_range(self, client):
        """Credits cap at 30 — anything above is invalid."""
        res = client.post(
            "/api/grades/manual",
            json={"course_name": "אלגוריתמים", "grade": 80, "credits": 50},
        )
        assert res.status_code == 400

    def test_400_when_grade_not_numeric(self, client):
        """grade must be parseable as a float."""
        res = client.post(
            "/api/grades/manual",
            json={"course_name": "אלגוריתמים", "grade": "ninety-five"},
        )
        assert res.status_code == 400
