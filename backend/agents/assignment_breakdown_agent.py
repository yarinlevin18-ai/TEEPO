"""
Assignment Breakdown Agent - מפרק משימה לצעדים קטנים עם הערכת זמן.
"""
import json
import re
from typing import Dict, Any
from agents.base_study_agent import BaseStudyAgent


class AssignmentBreakdownAgent(BaseStudyAgent):
    name = "assignment_breakdown"
    description = "מפרק משימות לימודיות לצעדים קטנים עם הערכת זמן"

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        title: str = input_data.get("title", "")
        description: str = input_data.get("description", "")
        deadline: str = input_data.get("deadline", "")
        course: str = input_data.get("course", "")

        if not title and not description:
            return {"status": "error", "message": "חסר שם משימה או תיאור"}

        prompt = f"""אתה עוזר לימוד אישי שמפרק משימות לצעדים ברורים.

משימה: {title}
{f"תיאור: {description}" if description else ""}
{f"קורס: {course}" if course else ""}
{f"תאריך הגשה: {deadline}" if deadline else ""}

פרק את המשימה לצעדים מעשיים ב-JSON:
{{
  "summary": "תיאור קצר של המשימה",
  "total_estimated_hours": 0,
  "tasks": [
    {{
      "title": "שם הצעד",
      "description": "מה לעשות",
      "order": 1,
      "estimated_hours": 0.5,
      "tips": "טיפ קצר"
    }}
  ],
  "study_resources": ["משאב 1", "משאב 2"]
}}

השתמש בעברית. ודא שהצעדים לוגיים ומסודרים לפי סדר הגיוני."""

        raw = self._call_claude(prompt)
        try:
            match = re.search(r"\{[\s\S]+\}", raw)
            if match:
                data = json.loads(match.group())
                data["status"] = "success"
                return data
        except Exception:
            pass

        return {"status": "success", "summary": title, "tasks": [{"title": raw[:200], "order": 1}]}
