"""
BGU Sync Agent - מסנכרן נתונים מ-Moodle ומהפורטל לתוך בסיס הנתונים.
"""
import uuid
from typing import Dict, Any
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
            return self._sync_assignments(user_id, input_data.get("course_url", ""))
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
        results = {}
        errors = []

        # Sync Moodle courses
        try:
            courses_result = self._sync_courses(user_id)
            results["courses"] = courses_result
        except Exception as e:
            errors.append(f"courses: {e}")
            courses_result = {"count": 0}

        total = courses_result.get("count", 0)
        scraped = len(courses_result.get("courses", []))
        skipped = courses_result.get("skipped", 0)

        msg = f"נמצאו {scraped} קורסים ב-Moodle"
        if total > 0:
            msg += f", נשמרו {total} חדשים"
        if skipped > 0:
            msg += f", {skipped} כבר קיימים"
        if errors:
            msg += f" (שגיאות: {'; '.join(errors)})"

        return {
            "status": "success",
            "synced": results,
            "message": msg,
        }

    def _sync_courses(self, user_id: str) -> Dict:
        result = bgu_scraper.scrape_moodle_courses()
        if result["status"] != "success":
            return result

        courses = result.get("courses", [])
        saved = 0
        skipped = 0
        db_errors = []

        # Load existing courses to avoid duplicates
        existing_titles = set()
        try:
            existing = db.get_courses(user_id)
            if existing.data:
                existing_titles = {c["title"] for c in existing.data}
        except Exception as e:
            logger.warning(f"[sync] Could not load existing courses: {e}")

        for course in courses:
            # Skip if course already exists
            if course["title"] in existing_titles:
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
                    "description": f"קורס BGU - {course['title']}",
                    "status": "active",
                })
                saved += 1

                # Sync assignments for this course
                if course.get("url"):
                    try:
                        self._sync_assignments(user_id, course["url"], course_id)
                    except Exception as e:
                        logger.warning(f"[sync] Assignment sync error for {course['title']}: {e}")

            except Exception as e:
                db_errors.append(str(e))

        return {
            "status": "success",
            "count": saved,
            "skipped": skipped,
            "courses": courses,
            "db_errors": db_errors[:3] if db_errors else [],
        }

    def _sync_assignments(self, user_id: str, course_url: str, course_id: str = None) -> Dict:
        result = bgu_scraper.scrape_course_assignments(course_url)
        if result["status"] != "success":
            return result

        assignments = result.get("assignments", [])
        saved = 0

        for a in assignments:
            try:
                data = {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "title": a["title"],
                    "description": f"מקור: {a.get('url', '')}",
                    "status": "todo",
                    "priority": "medium",
                    "deadline": None,
                }
                if course_id:
                    data["course_id"] = course_id
                if a.get("deadline_text"):
                    data["description"] += f" | תאריך: {a['deadline_text']}"
                db.create_assignment(data)
                saved += 1
            except Exception:
                pass

        return {"status": "success", "count": saved}
