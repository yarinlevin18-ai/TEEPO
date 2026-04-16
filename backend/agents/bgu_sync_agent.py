"""
BGU Sync Agent - מסנכרן נתונים מ-Moodle ומהפורטל לתוך בסיס הנתונים.

Uses Moodle AJAX APIs for reliable bulk data fetching:
- Courses via core_course_get_enrolled_courses_by_timeline_classification
- Assignments via mod_assign_get_assignments + calendar events
- Materials via core_course_get_contents
- Grades via gradereport_overview_get_course_grades
"""
import uuid
from typing import Dict, Any, List
from agents.base_study_agent import BaseStudyAgent
from services import bgu_scraper, supabase_client as db
from config import logger


class BGUSyncAgent(BaseStudyAgent):
    name = "bgu_sync"
    description = "מסנכרן קורסים, מטלות ולוח שעות מאתרי BGU לאפליקציה"

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        action: str = input_data.get("action", "sync_all")
        user_id: str = input_data.get("user_id", "")

        if action == "sync_all":
            return self._sync_all(user_id)
        elif action == "sync_courses":
            return self._sync_courses(user_id)
        elif action == "sync_assignments":
            return self._sync_assignments_bulk(user_id)
        elif action == "check_status":
            return self._check_status()
        return {"status": "error", "message": "פעולה לא ידועה"}

    def _check_status(self) -> Dict:
        moodle_ok = bgu_scraper.is_session_valid("moodle")
        portal_ok = bgu_scraper.is_session_valid("portal")
        return {
            "status": "success",
            "moodle_connected": moodle_ok,
            "portal_connected": portal_ok,
        }

    def _sync_all(self, user_id: str) -> Dict:
        """Full sync: courses + assignments + schedule. Returns detailed report."""
        report = {
            "courses": {"synced": 0, "skipped": 0, "errors": []},
            "assignments": {"synced": 0, "skipped": 0, "errors": []},
            "schedule": {"status": "skipped"},
        }

        # 1. Sync courses
        try:
            courses_result = self._sync_courses(user_id)
            report["courses"]["synced"] = courses_result.get("saved", 0)
            report["courses"]["skipped"] = courses_result.get("skipped", 0)
            report["courses"]["total_found"] = len(courses_result.get("courses", []))
            if courses_result.get("db_errors"):
                report["courses"]["errors"] = courses_result["db_errors"][:3]
        except Exception as e:
            report["courses"]["errors"].append(str(e))
            logger.error(f"[sync] Course sync failed: {e}")

        # 2. Sync assignments (bulk via AJAX)
        try:
            assign_result = self._sync_assignments_bulk(user_id)
            report["assignments"]["synced"] = assign_result.get("saved", 0)
            report["assignments"]["skipped"] = assign_result.get("skipped", 0)
            report["assignments"]["total_found"] = assign_result.get("total_found", 0)
        except Exception as e:
            report["assignments"]["errors"].append(str(e))
            logger.error(f"[sync] Assignment sync failed: {e}")

        # 3. Try schedule
        try:
            schedule_result = bgu_scraper.scrape_portal_schedule()
            report["schedule"]["status"] = schedule_result.get("status", "error")
        except Exception as e:
            report["schedule"]["status"] = "error"

        # Build human-readable summary
        c = report["courses"]
        a = report["assignments"]
        parts = []

        if c.get("total_found", 0) > 0:
            parts.append(f"📚 {c['total_found']} קורסים נמצאו ({c['synced']} חדשים, {c['skipped']} קיימים)")
        else:
            parts.append("📚 לא נמצאו קורסים")

        if a.get("total_found", 0) > 0:
            parts.append(f"📝 {a['total_found']} מטלות נמצאו ({a['synced']} חדשות, {a['skipped']} קיימות)")
        else:
            parts.append("📝 לא נמצאו מטלות")

        has_errors = bool(c.get("errors") or a.get("errors"))
        if has_errors:
            parts.append("⚠️ חלק מהסנכרון נכשל — בדוק את הלוג")

        return {
            "status": "success" if not has_errors else "partial",
            "report": report,
            "message": "\n".join(parts),
        }

    def _sync_courses(self, user_id: str) -> Dict:
        """Sync courses from Moodle to Supabase."""
        result = bgu_scraper.scrape_moodle_courses()
        if result["status"] != "success":
            return result

        courses = result.get("courses", [])
        saved = 0
        skipped = 0
        db_errors = []

        # Load existing courses to avoid duplicates
        existing_titles = set()
        existing_moodle_ids = set()
        try:
            existing = db.get_courses(user_id)
            if existing.data:
                existing_titles = {c["title"] for c in existing.data}
                existing_moodle_ids = {
                    c.get("source_url", "").split("id=")[-1]
                    for c in existing.data if "id=" in (c.get("source_url") or "")
                }
        except Exception as e:
            logger.warning(f"[sync] Could not load existing courses: {e}")

        for course in courses:
            # Skip duplicates by title or Moodle ID
            moodle_id = course.get("moodle_id", "")
            if course["title"] in existing_titles or moodle_id in existing_moodle_ids:
                skipped += 1
                continue

            course_id = str(uuid.uuid4())
            try:
                db.create_course({
                    "id": course_id,
                    "user_id": user_id,
                    "title": course["title"],
                    "source": "bgu",
                    "source_url": course.get("url", ""),
                    "description": course.get("summary") or f"קורס BGU - {course['title']}",
                    "status": "active",
                })
                saved += 1
            except Exception as e:
                db_errors.append(f"{course['title']}: {str(e)[:100]}")

        return {
            "status": "success",
            "saved": saved,
            "skipped": skipped,
            "courses": courses,
            "db_errors": db_errors[:5],
        }

    def _sync_assignments_bulk(self, user_id: str) -> Dict:
        """Sync all assignments at once via Moodle AJAX API."""
        result = bgu_scraper.scrape_all_assignments()
        if result["status"] != "success":
            return result

        assignments = result.get("assignments", [])
        saved = 0
        skipped = 0

        # Load existing assignments to avoid duplicates
        existing_titles = set()
        try:
            existing = db.get_assignments(user_id)
            if existing.data:
                existing_titles = {a["title"] for a in existing.data}
        except Exception as e:
            logger.warning(f"[sync] Could not load existing assignments: {e}")

        # Try to map course names to our DB course IDs
        course_id_map = {}
        try:
            courses = db.get_courses(user_id)
            if courses.data:
                for c in courses.data:
                    course_id_map[c["title"]] = c["id"]
        except Exception:
            pass

        for a in assignments:
            if a["title"] in existing_titles:
                skipped += 1
                continue

            try:
                data = {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "title": a["title"],
                    "description": a.get("description") or f"מקור: {a.get('url', '')}",
                    "status": "todo",
                    "priority": "medium",
                    "deadline": a.get("deadline"),
                }
                # Link to course if we can match it
                course_name = a.get("course_name", "")
                if course_name and course_name in course_id_map:
                    data["course_id"] = course_id_map[course_name]

                db.create_assignment(data)
                saved += 1
            except Exception as e:
                logger.debug(f"[sync] Assignment save failed: {e}")

        return {
            "status": "success",
            "saved": saved,
            "skipped": skipped,
            "total_found": len(assignments),
        }
