"""
POST /api/sync/all — bulk Moodle sync.

This route is the glue between the frontend "סנכרן הכל" button and the
existing per-source scrapers. Tests cover the contract:

  - Validates the request body (must be a list under `courses`)
  - Wraps `scrape_all_assignments` / `scrape_course_materials` / `scrape_grades`
    but does NOT re-implement them — they're mocked here
  - Filters scraper output by per-course `last_synced_at` cutoff
  - First-time sync (no cutoff) surfaces everything as new
  - Per-course failures don't sink the batch — they end up as `error` on
    the per-course result, sibling results still succeed
  - Updates the `last_synced_at` column on the supabase `courses` table
    on success (best-effort, doesn't fail the response if it errors)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock


class TestSyncAll:
    def test_rejects_non_list_courses(self, client):
        res = client.post("/api/sync/all", json={"courses": "not a list"})
        assert res.status_code == 400
        body = res.get_json()
        assert body["error"] == "bad_request"

    def test_empty_courses_returns_empty_results(self, client, mocker):
        # Stub the scrapers — they should not be called with empty input
        # for materials/grades (assignments still gets a no-op call).
        mocker.patch("routes.sync.scrape_all_assignments", return_value={"assignments": []})
        mocker.patch("routes.sync.scrape_grades", return_value={"grades": []})
        mocker.patch("routes.sync.scrape_course_materials", return_value={"materials": []})

        res = client.post("/api/sync/all", json={"courses": []})
        assert res.status_code == 200
        body = res.get_json()
        assert body["courses_scanned"] == 0
        assert body["results"] == []
        assert body["totals"] == {"new_assignments": 0, "new_files": 0, "new_grades": 0}
        assert "synced_at" in body

    def test_first_sync_surfaces_everything(self, client, mocker, supabase_mock):
        """A course with no `last_synced_at` is treated as never-synced,
        so every scraper hit ends up in the response."""
        mocker.patch("routes.sync.scrape_all_assignments", return_value={
            "assignments": [
                {
                    "course_moodle_id": "1001",
                    "title": "HW3",
                    "deadline": "2026-06-01T23:59:00+00:00",
                },
                {
                    "course_moodle_id": "1001",
                    "title": "HW4",
                    "deadline": "2026-06-08T23:59:00+00:00",
                },
            ],
        })
        mocker.patch("routes.sync.scrape_grades", return_value={
            "grades": [{"course_moodle_id": "1001", "course_name": "DS", "grade": 92}],
        })
        mocker.patch("routes.sync.scrape_course_materials", return_value={
            "materials": [
                {"title": "lecture9.pdf", "url": "https://m/x", "type": "resource"},
            ],
        })

        res = client.post("/api/sync/all", json={
            "courses": [{
                "course_id": "uuid-1",
                "moodle_id": "1001",
                "title": "Data Structures",
                "source_url": "https://moodle.bgu.ac.il/course/view.php?id=1001",
                # no last_synced_at — first-time sync
            }],
        })
        assert res.status_code == 200
        body = res.get_json()
        assert body["courses_scanned"] == 1
        assert len(body["results"]) == 1
        result = body["results"][0]
        assert len(result["new_assignments"]) == 2
        assert len(result["new_grades"]) == 1
        assert len(result["new_files"]) == 1
        assert result["error"] is None
        assert body["totals"] == {"new_assignments": 2, "new_files": 1, "new_grades": 1}

    def test_filters_assignments_by_last_synced_at(self, client, mocker, supabase_mock):
        """An assignment with `deadline` earlier than the cutoff is filtered out."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        old_deadline = (cutoff - timedelta(days=30)).isoformat()
        new_deadline = (cutoff + timedelta(days=14)).isoformat()

        mocker.patch("routes.sync.scrape_all_assignments", return_value={
            "assignments": [
                # Old assignment — its deadline predates the cutoff
                {"course_moodle_id": "200", "title": "old hw", "deadline": old_deadline},
                # New assignment — deadline is after the cutoff
                {"course_moodle_id": "200", "title": "new hw", "deadline": new_deadline},
            ],
        })
        mocker.patch("routes.sync.scrape_grades", return_value={"grades": []})
        mocker.patch("routes.sync.scrape_course_materials", return_value={"materials": []})

        res = client.post("/api/sync/all", json={
            "courses": [{
                "course_id": "uuid-2",
                "moodle_id": "200",
                "title": "Calc",
                "last_synced_at": cutoff.isoformat(),
            }],
        })
        body = res.get_json()
        new_titles = [a["title"] for a in body["results"][0]["new_assignments"]]
        assert "new hw" in new_titles
        assert "old hw" not in new_titles

    def test_per_course_materials_failure_does_not_sink_batch(self, client, mocker, supabase_mock):
        """If scrape_course_materials raises for one course, the other
        courses still come back populated and the failing course just has
        empty `new_files` (the assignments/grades for it still resolve)."""
        mocker.patch("routes.sync.scrape_all_assignments", return_value={
            "assignments": [
                {"course_moodle_id": "A", "title": "ok asgn"},
            ],
        })
        mocker.patch("routes.sync.scrape_grades", return_value={"grades": []})

        def materials_side_effect(url):
            if "broken" in url:
                raise RuntimeError("403 forbidden")
            return {"materials": [{"title": "ok file", "url": "u"}]}
        mocker.patch("routes.sync.scrape_course_materials", side_effect=materials_side_effect)

        res = client.post("/api/sync/all", json={
            "courses": [
                {"course_id": "u-ok", "moodle_id": "A", "title": "OK Course",
                 "source_url": "https://moodle/ok"},
                {"course_id": "u-broken", "moodle_id": "B", "title": "Broken Course",
                 "source_url": "https://moodle/broken"},
            ],
        })
        assert res.status_code == 200
        body = res.get_json()
        assert body["courses_scanned"] == 2
        names = {r["course_name"]: r for r in body["results"]}
        # OK course got its materials
        assert len(names["OK Course"]["new_files"]) == 1
        # Broken course returned with empty files — failure was swallowed
        assert names["Broken Course"]["new_files"] == []

    def test_updates_last_synced_at_in_supabase(self, client, mocker, supabase_mock):
        """On success the route writes `last_synced_at = now` to the
        supabase `courses` row, scoped to the user_id."""
        mocker.patch("routes.sync.scrape_all_assignments", return_value={"assignments": []})
        mocker.patch("routes.sync.scrape_grades", return_value={"grades": []})
        mocker.patch("routes.sync.scrape_course_materials", return_value={"materials": []})

        update_mock = MagicMock()
        update_chain = MagicMock()
        update_chain.eq.return_value = update_chain
        update_chain.execute.return_value = MagicMock(data=[])
        update_mock.return_value = update_chain
        supabase_mock.table.return_value.update = update_mock

        client.post("/api/sync/all", json={
            "courses": [{"course_id": "uuid-3", "moodle_id": "300", "title": "X"}],
        })

        # The update was issued with last_synced_at on the courses table
        assert update_mock.called
        called_with = update_mock.call_args[0][0]
        assert "last_synced_at" in called_with

    def test_global_scrape_failure_still_returns_per_course_results(self, client, mocker, supabase_mock):
        """If scrape_all_assignments itself blows up, each course should
        still come back with empty assignments rather than the whole route
        500-ing — the user can still see materials/grades."""
        mocker.patch("routes.sync.scrape_all_assignments", side_effect=RuntimeError("moodle down"))
        mocker.patch("routes.sync.scrape_grades", return_value={"grades": []})
        mocker.patch("routes.sync.scrape_course_materials", return_value={"materials": []})

        res = client.post("/api/sync/all", json={
            "courses": [{"course_id": "u", "moodle_id": "1", "title": "X"}],
        })
        assert res.status_code == 200
        body = res.get_json()
        assert body["results"][0]["new_assignments"] == []

    def test_short_circuits_when_moodle_not_connected(self, client, mocker, supabase_mock):
        """When BOTH global scrapers return the 'לא מחובר' error pattern,
        the route short-circuits with moodle_connected=false so the modal
        can show a 'connect Moodle' CTA instead of silent empty results."""
        mocker.patch("routes.sync.scrape_all_assignments", return_value={
            "status": "error", "message": "לא מחובר ל-Moodle.", "assignments": [],
        })
        mocker.patch("routes.sync.scrape_grades", return_value={
            "status": "error", "message": "לא מחובר", "grades": [],
        })
        # If we reach materials, the test should fail — the short-circuit
        # must skip that work entirely.
        mat_mock = mocker.patch("routes.sync.scrape_course_materials")

        res = client.post("/api/sync/all", json={
            "courses": [
                {"course_id": "u1", "moodle_id": "1", "title": "X", "source_url": "https://m/1"},
                {"course_id": "u2", "moodle_id": "2", "title": "Y", "source_url": "https://m/2"},
            ],
        })
        assert res.status_code == 200
        body = res.get_json()
        assert body["moodle_connected"] is False
        assert "לא מחובר" in (body["moodle_error"] or "")
        assert body["results"] == []
        assert mat_mock.call_count == 0  # short-circuit avoided the per-course loop

    def test_one_scraper_failing_is_not_treated_as_not_connected(self, client, mocker, supabase_mock):
        """If only one of the two global scrapers reports 'not connected',
        treat it as a transient and continue — could be a real account that
        just has stale grades cookies but valid Moodle ones."""
        mocker.patch("routes.sync.scrape_all_assignments", return_value={"assignments": []})
        mocker.patch("routes.sync.scrape_grades", return_value={
            "status": "error", "message": "לא מחובר",
        })
        mocker.patch("routes.sync.scrape_course_materials", return_value={"materials": []})

        res = client.post("/api/sync/all", json={
            "courses": [{"course_id": "u", "moodle_id": "1", "title": "X"}],
        })
        body = res.get_json()
        # Did NOT short-circuit
        assert body["moodle_connected"] is True
        assert body["courses_scanned"] == 1
