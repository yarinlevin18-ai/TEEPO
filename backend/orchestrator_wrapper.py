"""
Study Orchestrator - wraps and extends the existing orchestrator from
AI/Agents to add study-specific functionality with Hebrew prompts.
"""
import sys
import os
import re
from typing import Dict, Any, List, Optional

from config import ORCHESTRATOR_PATH, CLAUDE_MODEL, ANTHROPIC_API_KEY, logger
import anthropic

# ── Input safety ──────────────────────────────────────────────────────
MAX_CONTENT_LENGTH = 50_000  # ~50K chars max for lesson content
MAX_TITLE_LENGTH = 500
MAX_QUESTIONS = 50


def _sanitize_for_prompt(text: str, max_len: int = MAX_CONTENT_LENGTH) -> str:
    """Truncate and strip known prompt injection patterns from user input."""
    if not text:
        return ""
    text = text[:max_len]
    # Strip common injection markers (but preserve legitimate Hebrew/English content)
    # These patterns try to override the system prompt
    injection_patterns = [
        r'(?i)ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)',
        r'(?i)you\s+are\s+now\s+a',
        r'(?i)new\s+instructions?\s*:',
        r'(?i)system\s*:\s*',
        r'(?i)forget\s+(everything|all|your)\s+(above|instructions?)',
    ]
    for pattern in injection_patterns:
        text = re.sub(pattern, '[filtered]', text)
    return text.strip()

# Inject the existing orchestrator so we can reuse its agents
if ORCHESTRATOR_PATH and os.path.isdir(ORCHESTRATOR_PATH):
    sys.path.insert(0, ORCHESTRATOR_PATH)

try:
    from orchestrator.orchestrator import Orchestrator as BaseOrchestrator
    from orchestrator.agent_registry import AgentRegistry
    _BASE_AVAILABLE = True
    logger.info("External orchestrator loaded successfully.")
except ImportError:
    _BASE_AVAILABLE = False
    BaseOrchestrator = object
    AgentRegistry = None
    logger.info("External orchestrator not available — using direct Claude API calls.")


class StudyOrchestrator:
    """
    מארגן לימודים - משתמש בסוכנים הקיימים ומוסיף שיטות ייעודיות ללמידה.
    כל הבקשות לקלוד נשלחות בעברית.
    """

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self.model = CLAUDE_MODEL

        # Load the base registry (includes all existing agents + our new study agents)
        agents_dir = os.path.join(os.path.dirname(__file__), "agents")
        if _BASE_AVAILABLE and AgentRegistry:
            try:
                self.registry = AgentRegistry()
                self._load_study_agents(agents_dir)
                logger.info("Agent registry initialized with external orchestrator.")
            except Exception as e:
                logger.warning(f"Failed to init agent registry: {e}. Using local agents.")
                self.registry = None
                self._local_agents = self._load_local_agents(agents_dir)
        else:
            self.registry = None
            self._local_agents = self._load_local_agents(agents_dir)
            logger.info(f"Loaded {len(self._local_agents)} local agents: {list(self._local_agents.keys())}")

    def _load_local_agents(self, agents_dir: str) -> Dict:
        """Load agents from local agents/ directory."""
        import importlib.util
        agents = {}
        if not os.path.isdir(agents_dir):
            return agents
        for fname in os.listdir(agents_dir):
            if not fname.endswith(".py") or fname.startswith("_"):
                continue
            fpath = os.path.join(agents_dir, fname)
            spec = importlib.util.spec_from_file_location(fname[:-3], fpath)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            for attr in dir(mod):
                cls = getattr(mod, attr)
                if (
                    isinstance(cls, type)
                    and hasattr(cls, "name")
                    and hasattr(cls, "execute")
                    and cls.__name__ != "BaseStudyAgent"
                ):
                    instance = cls()
                    agents[instance.name] = instance
        return agents

    def _load_study_agents(self, agents_dir: str):
        """Load and register our study-specific agents into the existing registry."""
        import importlib.util
        if not os.path.isdir(agents_dir):
            return
        for fname in os.listdir(agents_dir):
            if not fname.endswith(".py") or fname.startswith("_"):
                continue
            fpath = os.path.join(agents_dir, fname)
            spec = importlib.util.spec_from_file_location(fname[:-3], fpath)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)

    def _execute_agent(self, agent_name: str, input_data: Dict) -> Dict:
        """Run a single agent by name."""
        if self.registry:
            try:
                return self.registry.execute_agent(agent_name, input_data)
            except Exception as e:
                logger.warning(f"Registry agent '{agent_name}' failed: {e}. Trying local agents.")
        agents = getattr(self, "_local_agents", {})
        if agent_name in agents:
            logger.debug(f"Executing local agent: {agent_name}")
            return agents[agent_name].execute(input_data)
        # Fallback: direct Claude call
        logger.debug(f"Agent '{agent_name}' not found — falling back to direct Claude call.")
        return self._direct_claude(input_data.get("prompt", str(input_data)))

    def _direct_claude(self, prompt: str) -> Dict:
        """Direct Claude call as fallback when an agent is unavailable."""
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        return {"status": "success", "result": resp.content[0].text}

    # ------------------------------------------------------------------ #
    #  Study-specific methods – all prompts in Hebrew                      #
    # ------------------------------------------------------------------ #

    def summarize_lesson(self, content: str, lesson_title: str = "") -> Dict:
        """סיכום שיעור בעברית."""
        content = _sanitize_for_prompt(content)
        lesson_title = _sanitize_for_prompt(lesson_title, MAX_TITLE_LENGTH)
        prompt = f"""אתה עוזר לימוד אישי.
{"שם השיעור: " + lesson_title if lesson_title else ""}
תוכן השיעור:
{content}

אנא סכם את השיעור בעברית:
1. נקודות עיקריות (בולטים)
2. מושגים חשובים
3. מה חשוב לזכור לבחינה"""
        return self._execute_agent("analysis", {"findings": prompt, "topic": lesson_title or "שיעור"})

    def generate_quiz(self, lesson_text: str, num_questions: int = 10) -> Dict:
        """יצירת שאלות קוויז מתוכן שיעור."""
        lesson_text = _sanitize_for_prompt(lesson_text)
        num_questions = max(1, min(num_questions, MAX_QUESTIONS))
        prompt = f"""אתה יוצר קוויזים חינוכיים.
תוכן השיעור:
{lesson_text}

צור {num_questions} שאלות בחירה מרובה בעברית.
פורמט JSON:
{{
  "questions": [
    {{
      "question": "...",
      "options": ["א) ...", "ב) ...", "ג) ...", "ד) ..."],
      "correct_index": 0,
      "explanation": "..."
    }}
  ]
}}"""
        return self._execute_agent("content", {"topic": prompt, "type": "quiz"})

    def answer_question(self, question: str, context: str = "", history: List = None) -> Dict:
        """עונה על שאלת לימוד בצ'אט אינטראקטיבי."""
        question = _sanitize_for_prompt(question, 5000)
        context = _sanitize_for_prompt(context, 10000)
        messages = history[-20:] if history else []  # limit history to last 20 messages
        messages.append({"role": "user", "content": question})
        system = (
            "אתה מנחה לימוד אישי שעונה בעברית בצורה ברורה וחינוכית. "
            "השתמש בדוגמאות כשצריך. "
            + (f"הקשר מהקורס: {context}" if context else "")
        )
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=system,
            messages=messages,
        )
        answer = resp.content[0].text
        messages.append({"role": "assistant", "content": answer})
        return {"status": "success", "answer": answer, "history": messages}

    def create_study_plan(self, courses: List[Dict], deadline: str, hours_per_week: int = 10) -> Dict:
        """יצירת תכנית לימודים מותאמת אישית."""
        courses_str = "\n".join([f"- {c.get('title', c)}" for c in courses])
        prompt = f"""אתה מתכנן לימודים מקצועי.
הקורסים:
{courses_str}
תאריך יעד: {deadline}
שעות פנויות בשבוע: {hours_per_week}

צור תכנית לימודים שבועית מפורטת בעברית הכוללת:
1. חלוקת זמן אופטימלית בין הקורסים
2. סדר עדיפות לפי דדליין
3. משימות יומיות קונקרטיות"""
        return self._execute_agent("planner", {"goal": prompt, "context": str(courses), "constraints": f"עד {deadline}"})

    def breakdown_assignment(self, title: str, description: str, deadline: str) -> Dict:
        """פירוק משימה לצעדים קטנים."""
        return self._execute_agent(
            "assignment_breakdown",
            {"title": title, "description": description, "deadline": deadline},
        )

    def extract_course(self, url: str, credentials: Optional[Dict] = None) -> Dict:
        """חילוץ מבנה קורס מכתובת URL."""
        return self._execute_agent(
            "content_extraction",
            {"url": url, "credentials": credentials or {}},
        )

    def get_bgu_advice(self, course_name: str, major: str = "", your_courses: List = None) -> Dict:
        """ייעוץ אקדמי ייעודי לבן-גוריון."""
        return self._execute_agent(
            "academic",
            {
                "course_name": course_name,
                "major": major,
                "your_courses": your_courses or [],
                "action": "advise",
            },
        )

    def save_memory(self, content: str, memory_type: str, source: str = "study_buddy") -> Dict:
        """שמירת מידע בזיכרון לטווח ארוך."""
        return self._execute_agent(
            "memory",
            {"action": "save", "type": memory_type, "content": content, "source_agent": source},
        )

    def get_memories(self, query: str = "", memory_type: str = "") -> Dict:
        """אחזור זיכרונות רלוונטיים."""
        return self._execute_agent(
            "memory",
            {"action": "search" if query else "get", "query": query, "type": memory_type},
        )


# Singleton
_orchestrator: Optional[StudyOrchestrator] = None


def get_orchestrator() -> StudyOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = StudyOrchestrator()
    return _orchestrator
