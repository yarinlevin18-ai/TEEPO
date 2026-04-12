"""
Academic Agent - יועץ אקדמי ייעודי לאוניברסיטת בן-גוריון.
Phase 1: ידע כללי על BGU + התאמה אישית לפי המחלקה/קורסים של המשתמש.
"""
import json
import re
from typing import Dict, Any, List
from agents.base_study_agent import BaseStudyAgent


# --- BGU knowledge base (Phase 1 - static, will grow over time) ---
BGU_KNOWLEDGE = {
    "university": "אוניברסיטת בן-גוריון בנגב, באר שבע",
    "faculties": [
        "מדעי הטבע",
        "מדעי ההנדסה",
        "מדעי הרוח ומדעי החברה",
        "מדעי הבריאות",
        "ניהול עסקים",
        "מדעי המחשב ומערכות מידע",
    ],
    "tips": [
        "ניתן למצוא חומרי עזר בספרייה המרכזית ובאתר הספרייה",
        "מרכז הסיוע ללומדים (מסל) מציע סיוע בכתיבה אקדמית",
        "שעות קבלה של מרצים מפורסמות ב-Moodle",
        "קבוצות לימוד ניתן לארגן דרך עמוד הקורס ב-Moodle",
        "מאגר המידע של הספרייה כולל גישה לכתבי עת מדעיים",
    ],
    "systems": {
        "moodle": "מערכת ניהול הלמידה - moodle.bgu.ac.il",
        "registration": "מערכת לרישום לקורסים - www.bgu.ac.il",
        "library": "ספרייה מרכזית - library.bgu.ac.il",
    },
}


class AcademicAgent(BaseStudyAgent):
    name = "academic"
    description = "יועץ אקדמי ייעודי לבן-גוריון - עצות לקורסים, דרישות, ואסטרטגיות לימוד"

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        action: str = input_data.get("action", "advise")
        course_name: str = input_data.get("course_name", "")
        major: str = input_data.get("major", "")
        your_courses: List = input_data.get("your_courses", [])
        question: str = input_data.get("question", "")
        memory_context: str = input_data.get("memory_context", "")

        if action == "advise":
            return self._advise_for_course(course_name, major, memory_context)
        elif action == "personalize":
            return self._personalize(major, your_courses, memory_context)
        elif action == "question":
            return self._answer_academic_question(question, major, memory_context)
        else:
            return self._advise_for_course(course_name, major, memory_context)

    def _advise_for_course(self, course_name: str, major: str, memory_context: str = "") -> Dict:
        """עצות ספציפיות לקורס ב-BGU."""
        bgu_str = json.dumps(BGU_KNOWLEDGE, ensure_ascii=False, indent=2)
        prompt = f"""אתה יועץ אקדמי מנוסה באוניברסיטת בן-גוריון בנגב.

מידע על האוניברסיטה:
{bgu_str}

{f"המחלקה: {major}" if major else ""}
{f"היסטוריית לימודים של הסטודנט: {memory_context}" if memory_context else ""}

הקורס: {course_name}

תן עצות ספציפיות לקורס זה ב-BGU:
1. אסטרטגיית לימוד מומלצת
2. נושאים שכדאי להתמקד בהם
3. משאבים זמינים ב-BGU (ספרייה, Moodle, שעות קבלה)
4. טיפים שהסטודנטים מוצאים מועילים
5. איך לקשר את הקורס לקורסים אחרים במחלקה

ענה בעברית בצורה ברורה ומעשית."""

        answer = self._call_claude(prompt)
        return {
            "status": "success",
            "course": course_name,
            "advice": answer,
            "bgu_resources": BGU_KNOWLEDGE["systems"],
        }

    def _personalize(self, major: str, your_courses: List, memory_context: str = "") -> Dict:
        """תכנית אישית לפי המחלקה והקורסים של הסטודנט."""
        courses_str = "\n".join([f"- {c}" for c in your_courses]) if your_courses else "לא צוינו קורסים"
        prompt = f"""אתה יועץ אקדמי אישי באוניברסיטת בן-גוריון.

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
            "bgu_tips": BGU_KNOWLEDGE["tips"],
        }

    def _answer_academic_question(self, question: str, major: str, memory_context: str = "") -> Dict:
        """ענה על שאלה אקדמית כללית."""
        bgu_str = json.dumps(BGU_KNOWLEDGE["systems"], ensure_ascii=False)
        prompt = f"""אתה יועץ אקדמי ב-BGU.
מערכות האוניברסיטה: {bgu_str}
{f"מחלקה: {major}" if major else ""}
{f"הקשר: {memory_context}" if memory_context else ""}

שאלה: {question}

ענה בעברית בצורה ממוקדת ומועילה."""

        answer = self._call_claude(prompt)
        return {"status": "success", "answer": answer}
