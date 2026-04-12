"""
BGU Sync Agent - מסנכרן נתונים מ-Moodle ומהפורטל לתוך בסיס הנתונים.
"""
import uuid
from typing import Dict, Any
from agents.base_study_agent import BaseStudyAgent
from services import bgu_scraper, supabase_client as db


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

        # Sync Moodle courses
        courses_result = self._sync_courses(user_id)
        results["courses"] = courses_result

        return {
            "status": "success",
            "synced": results,
            "message": f"סונכרנו {courses_result.get('count', 0)} קורסים מ-Moodle",
        }

    def _sync_courses(self, user_id: str) -> Dict:
        result = bgu_scraper.scrape_moodle_courses()
        if result["status"] != "success":
            return result

        courses = result.get("courses", [])
        saved = 0

        for course in courses:
            course_id = str(uuid.uuid4())
            try:
                db.create_course({
                    "id": course_id,
                    "user_id": user_id,
                    "title": course["title"],
                    "source": "udemy",          # reuse field, BGU = custom
                    "source_url": course["url"],
                    "description": f"קורס BGU - {course['title']}",
                    "status": "active",
                })
                saved += 1

                # Sync assignments for this course
                if course.get("url"):
                    self._sync_assignments(user_id, course["url"], course_id)

            except Exception:
                pass  # Course might already exist (unique constraint)

        return {"status": "success", "count": saved, "courses": courses}

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
