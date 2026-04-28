"""
Academic Agent - יועץ אקדמי. בוחר את בסיס הידע לפי האוניברסיטה של המשתמש
(BGU / TAU) ומתאים את הפרומפט בהתאם.
"""
import json
from typing import Dict, Any, List

from agents.base_study_agent import BaseStudyAgent
from agents.university_knowledge import get_knowledge


class AcademicAgent(BaseStudyAgent):
    name = "academic"
    description = "יועץ אקדמי - עצות לקורסים, דרישות, ואסטרטגיות לימוד"

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        action: str = input_data.get("action", "advise")
        course_name: str = input_data.get("course_name", "")
        major: str = input_data.get("major", "")
        your_courses: List = input_data.get("your_courses", [])
        question: str = input_data.get("question", "")
        memory_context: str = input_data.get("memory_context", "")
        university: str = input_data.get("university", "bgu")
        kb = get_knowledge(university)

        if action == "advise":
            return self._advise_for_course(course_name, major, memory_context, kb)
        elif action == "personalize":
            return self._personalize(major, your_courses, memory_context, kb)
        elif action == "question":
            return self._answer_academic_question(question, major, memory_context, kb)
        else:
            return self._advise_for_course(course_name, major, memory_context, kb)

    def _advise_for_course(self, course_name: str, major: str, memory_context: str, kb: dict) -> Dict:
        """עצות ספציפיות לקורס."""
        kb_str = json.dumps(kb, ensure_ascii=False, indent=2)
        uni_name = kb["name"]
        prompt = f"""אתה יועץ אקדמי מנוסה ב{uni_name}.

מידע על האוניברסיטה:
{kb_str}

{f"המחלקה: {major}" if major else ""}
{f"היסטוריית לימודים של הסטודנט: {memory_context}" if memory_context else ""}

הקורס: {course_name}

תן עצות ספציפיות לקורס זה ב{uni_name}:
1. אסטרטגיית לימוד מומלצת
2. נושאים שכדאי להתמקד בהם
3. משאבים זמינים באוניברסיטה (ספרייה, Moodle, שעות קבלה)
4. טיפים שהסטודנטים מוצאים מועילים
5. איך לקשר את הקורס לקורסים אחרים במחלקה

ענה בעברית בצורה ברורה ומעשית."""

        answer = self._call_claude(prompt)
        return {
            "status": "success",
            "course": course_name,
            "advice": answer,
            "university": kb["code"],
            "resources": kb["systems"],
        }

    def _personalize(self, major: str, your_courses: List, memory_context: str, kb: dict) -> Dict:
        """תכנית אישית לפי המחלקה והקורסים של הסטודנט."""
        courses_str = "\n".join([f"- {c}" for c in your_courses]) if your_courses else "לא צוינו קורסים"
        uni_name = kb["name"]
        prompt = f"""אתה יועץ אקדמי אישי ב{uni_name}.

מחלקה: {major or "לא צוינה"}
קורסים נוכחיים:
{courses_str}

{f"מידע נוסף: {memory_context}" if memory_context else ""}

תן המלצות אישיות:
1. סדר עדיפות מומלץ בין הקורסים
2. קשרים בין הקורסים (מה עוזר למה)
3. אסטרטגיה כוללת לסמסטר
4. אזהרות ונקודות לשים לב
5. המלצות לקורסים עתידיים

ענה בעברית."""

        answer = self._call_claude(prompt)
        return {
            "status": "success",
            "major": major,
            "personalized_plan": answer,
            "university": kb["code"],
            "tips": kb["tips"],
        }

    def _answer_academic_question(self, question: str, major: str, memory_context: str, kb: dict) -> Dict:
        """ענה על שאלה אקדמית כללית."""
        systems_str = json.dumps(kb["systems"], ensure_ascii=False)
        uni_name = kb["name"]
        prompt = f"""אתה יועץ אקדמי ב{uni_name}.
מערכות האוניברסיטה: {systems_str}
{f"מחלקה: {major}" if major else ""}
{f"הקשר: {memory_context}" if memory_context else ""}

שאלה: {question}

ענה בעברית בצורה ממוקדת ומועילה."""

        answer = self._call_claude(prompt)
        return {"status": "success", "answer": answer, "university": kb["code"]}
