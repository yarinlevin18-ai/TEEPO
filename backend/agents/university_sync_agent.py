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
from services import moodle_scraper, supabase_client as db
from config import logger


class UniversitySyncAgent(BaseStudyAgent):
    name = "university_sync"
    description = "מסנכרן קורסים, מטלות ולוח שעות ממערכות האוניברסיטה (Moodle/פורטל) לאפליקציה"

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        action: str = input_data.get("action", "sync_all")
        user_id: str = input_data.get("user_id", "")

        if action == "sync_all":
            return self._sync_all(user_id)
        elif action == "sync_courses":
            return self._sync_courses(user_id)
        elif action == "sync_assignments":
            return self._sync_assignments_bulk(user_id)
        elif action == "sync_grades":
            return self._sync_grades(user_id)
        elif action == "check_status":
            return self._check_status()
        return {"status": "error", "message": "פעולה לא ידועה"}

    def _check_status(self) -> Dict:
        moodle_ok = moodle_scraper.is_session_valid("moodle")
        portal_ok = moodle_scraper.is_session_valid("portal")
        return {
            "status": "success",
            "moodle_connected": moodle_ok,
            "portal_connected": portal_ok,
        }

    def _sync_all(self, user_id: str) -> Dict:
        """Full sync: courses + assignments + grades + schedule. Returns detailed report."""
        report = {
            "courses": {"synced": 0, "skipped": 0, "errors": []},
            "assignments": {"synced": 0, "skipped": 0, "errors": []},
            "grades": {"synced": 0, "errors": []},
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

        # 3. Sync grades
        try:
            grades_result = self._sync_grades(user_id)
            report["grades"]["synced"] = grades_result.get("saved", 0)
        except Exception as e:
            report["grades"]["errors"].append(str(e))
            logger.error(f"[sync] Grade sync failed: {e}")

        # 4. Try schedule
        try:
            schedule_result = moodle_scraper.scrape_portal_schedule()
            report["schedule"]["status"] = schedule_result.get("status", "error")
        except Exception as e:
            report["schedule"]["status"] = "error"

        # Build human-readable summary
        c = report["courses"]
        a = report["assignments"]
        g = report["grades"]
        parts = []

        if c.get("total_found", 0) > 0:
            parts.append(f"📚 {c['total_found']} קורסים נמצאו ({c['synced']} חדשים, {c['skipped']} קיימים)")
        else:
            parts.append("📚 לא נמצאו קורסים")

        if a.get("total_found", 0) > 0:
            parts.append(f"📝 {a['total_found']} מטלות נמצאו ({a['synced']} חדשות, {a['skipped']} קיימות)")
        else:
            parts.append("📝 לא נמצאו מטלות")

        if g.get("synced", 0) > 0:
            parts.append(f"📊 {g['synced']} ציונים עודכנו")

        has_errors = bool(c.get("errors") or a.get("errors") or g.get("errors"))
        if has_errors:
            parts.append("⚠️ חלק מהסנכרון נכשל — בדוק את הלוג")

        return {
            "status": "success" if not has_errors else "partial",
            "report": report,
            "message": "\n".join(parts),
        }

    def _sync_courses(self, user_id: str) -> Dict:
        """Sync courses from Moodle to Supabase."""
        result = moodle_scraper.scrape_moodle_courses()
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

            # v2.1 enrichment — best-effort. Failures shouldn't block the
            # course row from being created, so we wrap and default to empty.
            metadata: dict = {}
            try:
                if course.get("url"):
                    md = moodle_scraper.scrape_course_metadata(course["url"])
                    if md.get("status") == "success":
                        metadata = md
            except Exception as e:
                logger.debug(f"[sync] metadata scrape failed for {course['title']}: {e}")

            try:
                db.create_course({
                    "id": course_id,
                    "user_id": user_id,
                    "title": course["title"],
                    "source": "bgu",
                    "source_url": course.get("url", ""),
                    "description": course.get("summary") or f"קורס BGU - {course['title']}",
                    "status": "active",
                    "lecturer_email": metadata.get("lecturer_email"),
                    "syllabus_url": metadata.get("syllabus_url"),
                    "teaching_assistants": metadata.get("teaching_assistants", []),
                    "course_links": metadata.get("course_links", []),
                    "portal_metadata": metadata.get(
                        "portal_metadata",
                        {"moodle_course_id": course.get("moodle_id", "")},
                    ),
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

    def _sync_grades(self, user_id: str) -> Dict:
        """Sync grades from Moodle + Portal into student_grades table."""
        from datetime import datetime as _dt

        result = moodle_scraper.scrape_grades()
        if result["status"] != "success":
            return result

        grades = result.get("grades", [])
        saved = 0

        for g in grades:
            name = g.get("course_name", "").strip()
            if not name:
                continue

            try:
                row = {
                    "user_id": user_id,
                    "course_name": name,
                    "source": g.get("source", "moodle"),
                    "updated_at": _dt.utcnow().isoformat(),
                }
                if g.get("grade") is not None:
                    row["grade"] = g["grade"]
                if g.get("grade_text"):
                    row["grade_text"] = g["grade_text"]
                if g.get("course_moodle_id"):
                    row["course_moodle_id"] = g["course_moodle_id"]
                if g.get("semester"):
                    row["semester"] = g["semester"]
                if g.get("academic_year"):
                    row["academic_year"] = g["academic_year"]
                if g.get("rank"):
                    row["rank"] = g["rank"]
                if g.get("credits"):
                    row["credits"] = g["credits"]

                db.get_client().table("student_grades").upsert(row).execute()
                saved += 1
            except Exception as e:
                logger.debug(f"[sync] Grade save failed for {name}: {e}")

        return {"status": "success", "saved": saved, "total_found": len(grades)}

    def _sync_assignments_bulk(self, user_id: str) -> Dict:
        """Sync all assignments at once via Moodle AJAX API."""
        result = moodle_scraper.scrape_all_assignments()
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
