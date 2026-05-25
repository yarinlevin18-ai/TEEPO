"""Per-university knowledge bases used by the academic advisor agent.

Each entry has the same shape (university name, faculties, tips, systems)
so the agent can render its prompt without branching per school. The
content here is intentionally static and human-edited — it changes
infrequently enough that pulling it from a DB every request would be
overkill, and we want the values to be reviewable in PR diffs.
"""
from typing import Literal

UniversityCode = Literal["bgu", "tau"]


UNIVERSITY_KNOWLEDGE: dict[str, dict] = {
    "bgu": {
        "code": "bgu",
        "name": "אוניברסיטת בן-גוריון בנגב",
        "city": "באר שבע",
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
    },
    "tau": {
        "code": "tau",
        "name": "אוניברסיטת תל אביב",
        "city": "תל אביב",
        "faculties": [
            "הפקולטה להנדסה",
            "הפקולטה למדעים מדויקים",
            "הפקולטה למדעי החיים",
            "הפקולטה למדעי הרוח",
            "הפקולטה למדעי החברה",
            "הפקולטה לרפואה",
            "הפקולטה למשפטים",
            "הפקולטה לניהול",
            "הפקולטה לאמנויות",
            "בית הספר לחינוך",
        ],
        "tips": [
            "ניתן למצוא חומרי עזר בספריות הפקולטיות ובמאגר Tau Library",
            "המרכז לתמיכה אקדמית מציע סדנאות כתיבה ושיטות למידה",
            "שעות קבלה של מרצים והודעות שוטפות מתפרסמות ב-Moodle",
            "מערכת UMS לרישום לקורסים פתוחה רק בחלונות הרישום שמפורסמים מראש",
            "התקבל לחיפוש מאמרים? Tau Discovery נותן גישה למאגרים אקדמיים מרכזיים",
        ],
        "systems": {
            "moodle": "מערכת ניהול הלמידה - moodle.tau.ac.il",
            "registration": "מערכת UMS לרישום לקורסים - www.ims.tau.ac.il",
            "library": "מאגרי הספרייה - library.tau.ac.il",
        },
    },
}


def get_knowledge(university: str | None) -> dict:
    """Return the knowledge dict for `university`, falling back to BGU.

    The fallback is intentional — pre-v2.1 users don't have a university
    set, and BGU is the default school for the original deployment.
    """
    code = (university or "").strip().lower()
    return UNIVERSITY_KNOWLEDGE.get(code) or UNIVERSITY_KNOWLEDGE["bgu"]
