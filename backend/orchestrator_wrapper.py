"""
Study Orchestrator - wraps and extends the existing orchestrator from
AI/Agents to add study-specific functionality with Hebrew prompts.

Now properly connected to the global memory system at ~/.claude/memory/
for cross-session learning and persistent user knowledge.
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


# ── Connect to the real memory system ─────────────────────────────────
_memory_available = False
_memory_module = None

# Try bundled copy first (works on Render / any deployment),
# then fall back to the external path (dev machine).
try:
    from services import memory_agent as _memory_module
    _memory_available = True
    info = _memory_module.agent_info()
    logger.info(
        f"Memory system connected (bundled). "
        f"{info.get('memory_count', 0)} memories in database. "
        f"DB: {info.get('storage', {}).get('db', 'unknown')}"
    )
except Exception:
    MEMORY_AGENT_PATH = os.path.join(
        os.path.expanduser("~"),
        "OneDrive", "Desktop", "AI", "Agents", "Memory", "agents"
    )
    if os.path.isdir(MEMORY_AGENT_PATH):
        sys.path.insert(0, MEMORY_AGENT_PATH)
        try:
            import memory_agent as _memory_module
            _memory_available = True
            info = _memory_module.agent_info()
            logger.info(
                f"Memory system connected (external). "
                f"{info.get('memory_count', 0)} memories in database. "
                f"DB: {info.get('storage', {}).get('db', 'unknown')}"
            )
        except Exception as e:
            logger.warning(f"Failed to load memory agent: {e}")
    else:
        logger.info("Memory agent not found. Memory disabled.")


# ── Connect to the real orchestrator ──────────────────────────────────
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

    Connected to:
    - Global memory system (~/.claude/memory/memory.db)
    - External agent registry (orchestrator/agents/)
    - Local study-specific agents (backend/agents/)
    - Web search (DuckDuckGo)
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
                logger.info(
                    f"Agent registry initialized. "
                    f"Available agents: {self.registry.list_agents() if hasattr(self.registry, 'list_agents') else 'unknown'}"
                )
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
    #  Memory System — connected to ~/.claude/memory/memory.db             #
    # ------------------------------------------------------------------ #

    def save_memory(self, content: str, memory_type: str = "agent_output",
                    source: str = "study_buddy", tags: str = None) -> Dict:
        """Save to the global memory system."""
        if not _memory_available or not _memory_module:
            logger.debug("Memory system not available, skipping save.")
            return {"status": "skipped", "reason": "memory not available"}
        try:
            result = _memory_module.save_memory(
                type=memory_type,
                content=content,
                source_agent=source,
                tags=tags,
            )
            logger.debug(f"[memory] Saved: type={memory_type} tags={tags} → {result.get('status')}")
            return result
        except Exception as e:
            logger.warning(f"[memory] Save failed: {e}")
            return {"status": "error", "message": str(e)}

    def get_memories(self, memory_type: str = None, limit: int = 10) -> Dict:
        """Retrieve memories from global system."""
        if not _memory_available or not _memory_module:
            return {"status": "skipped", "memories": [], "count": 0}
        try:
            return _memory_module.get_memories(type=memory_type, limit=limit)
        except Exception as e:
            logger.warning(f"[memory] Get failed: {e}")
            return {"status": "error", "memories": [], "count": 0}

    def search_memories(self, query: str) -> Dict:
        """Search memories by keyword."""
        if not _memory_available or not _memory_module:
            return {"status": "skipped", "memories": [], "count": 0}
        try:
            return _memory_module.search_memories(query)
        except Exception as e:
            logger.warning(f"[memory] Search failed: {e}")
            return {"status": "error", "memories": [], "count": 0}

    def _load_relevant_memories(self, question: str, course_name: str = "") -> str:
        """Load memories relevant to the current question for context injection."""
        if not _memory_available:
            return ""

        memory_parts = []

        # 1. Get user preferences
        prefs = self.get_memories(memory_type="preference", limit=5)
        if prefs.get("memories"):
            pref_text = "\n".join([m["content"] for m in prefs["memories"][:3]])
            memory_parts.append(f"## העדפות הסטודנט:\n{pref_text}")

        # 2. Search for topic-relevant memories
        if question and len(question) > 10:
            # Extract key terms for search
            search_results = self.search_memories(question[:100])
            if search_results.get("memories"):
                relevant = search_results["memories"][:3]
                rel_text = "\n".join([f"- {m['content'][:200]}" for m in relevant])
                memory_parts.append(f"## זיכרון רלוונטי מפגישות קודמות:\n{rel_text}")

        # 3. Search for course-specific memories
        if course_name:
            course_results = self.search_memories(course_name)
            if course_results.get("memories"):
                course_mems = course_results["memories"][:2]
                c_text = "\n".join([f"- {m['content'][:200]}" for m in course_mems])
                memory_parts.append(f"## זיכרון מהקורס:\n{c_text}")

        # 4. Get recent session summaries
        sessions = self.get_memories(memory_type="session", limit=3)
        if sessions.get("memories"):
            sess_text = "\n".join([f"- {m['content'][:150]}" for m in sessions["memories"][:2]])
            memory_parts.append(f"## פגישות אחרונות:\n{sess_text}")

        return "\n\n".join(memory_parts) if memory_parts else ""

    def _log_interaction(self, question: str, answer: str, course_name: str = "",
                         interaction_type: str = "chat") -> None:
        """Log significant interactions to memory for future learning."""
        if not _memory_available:
            return

        # Only save meaningful interactions (not greetings, short messages)
        if len(question) < 20 or len(answer) < 50:
            return

        try:
            # Save as agent_output with study-specific tags
            tags_list = ["learning-platform", "study-buddy", interaction_type]
            if course_name:
                # Clean course name for tags
                clean_name = re.sub(r'[^\w\s-]', '', course_name)[:50].strip()
                if clean_name:
                    tags_list.append(clean_name)

            content = (
                f"שאלה: {question[:200]}\n"
                f"תשובה (תקציר): {answer[:300]}"
            )

            self.save_memory(
                content=content,
                memory_type="agent_output",
                source="study_buddy",
                tags=",".join(tags_list),
            )
        except Exception as e:
            logger.debug(f"[memory] Interaction log failed: {e}")

    def save_session_summary(self, user_id: str, messages: List, course_name: str = "") -> None:
        """Summarize and save a study session to memory."""
        if not _memory_available or not _memory_module:
            return
        if len(messages) < 4:  # Only summarize meaningful sessions
            return

        try:
            # Build session data for summarization
            session_text = "\n".join([
                f"{'סטודנט' if m.get('role') == 'user' else 'AI'}: {m.get('content', '')[:100]}"
                for m in messages[-20:]
            ])

            tags = "learning-platform,study-session"
            if course_name:
                tags += f",{course_name[:50]}"

            # Use Claude to summarize the session
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=300,
                messages=[{
                    "role": "user",
                    "content": (
                        "סכם בקצרה (עד 100 מילים) את פגישת הלימוד הבאה. "
                        "ציין: נושאים שנלמדו, שאלות שנשאלו, ונקודות חשובות. "
                        "כתוב בעברית.\n\n"
                        f"השיחה:\n{session_text}"
                    ),
                }],
            )
            summary = resp.content[0].text

            self.save_memory(
                content=summary,
                memory_type="session",
                source="study_buddy",
                tags=tags,
            )
            logger.info(f"[memory] Session summary saved for user {user_id[:8]}...")

        except Exception as e:
            logger.warning(f"[memory] Session summary failed: {e}")

    def save_student_preference(self, preference: str, source: str = "study_buddy") -> Dict:
        """Save a learning preference (e.g., 'prefers examples', 'visual learner')."""
        return self.save_memory(
            content=preference,
            memory_type="preference",
            source=source,
            tags="learning-platform,student-preference",
        )

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

        result = self._execute_agent("analysis", {"findings": prompt, "topic": lesson_title or "שיעור"})

        # Log to memory
        summary_text = result.get("result") or result.get("summary") or result.get("answer") or ""
        if summary_text and lesson_title:
            self.save_memory(
                content=f"סיכום שיעור '{lesson_title}': {summary_text[:300]}",
                memory_type="agent_output",
                source="study_buddy",
                tags=f"learning-platform,lesson-summary,{lesson_title[:50]}",
            )

        return result

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

    def answer_question(self, question: str, context: str = "", history: List = None,
                        course_context: str = "", notes_context: str = "") -> Dict:
        """עונה על שאלת לימוד בצ'אט אינטראקטיבי — בסגנון NotebookLM."""
        question = _sanitize_for_prompt(question, 5000)
        context = _sanitize_for_prompt(context, 10000)
        course_context = _sanitize_for_prompt(course_context, 15000)
        notes_context = _sanitize_for_prompt(notes_context, 15000)
        messages = history[-20:] if history else []
        messages.append({"role": "user", "content": question})

        # Web search for relevant info
        web_context = ""
        try:
            from services.web_search import should_search, search_web, format_search_results
            if should_search(question):
                results = search_web(question, max_results=4)
                web_context = format_search_results(results)
                logger.debug(f"[answer_question] web search returned {len(results)} results")
        except Exception as e:
            logger.debug(f"[answer_question] web search skipped: {e}")

        # Load memories relevant to this question
        memory_context = ""
        course_name = ""
        if course_context:
            # Extract course name from context
            for line in course_context.split("\n"):
                if line.startswith("קורס:"):
                    course_name = line.replace("קורס:", "").strip()
                    break
        try:
            memory_context = self._load_relevant_memories(question, course_name)
        except Exception as e:
            logger.debug(f"[answer_question] memory load skipped: {e}")

        system_parts = [
            "אתה עוזר לימוד אישי חכם ומדויק, בסגנון NotebookLM של Google. ",
            "אתה מתמחה בהוראה, סיכום, והסברת חומר אקדמי.",
            "\n\n## כללי התנהגות:",
            "- ענה תמיד בעברית, בצורה ברורה ומדויקת.",
            "- השתמש בפורמט מסודר: כותרות, נקודות, מספור.",
            "- כשמסביר מושג — תן דוגמה קונקרטית אחת לפחות.",
            "- כשמסכם — צור סיכום מובנה עם נקודות עיקריות, מושגים, ומה חשוב לבחינה.",
            "- כשעוזר בתרגיל — הסבר צעד אחר צעד, אל תתן תשובה סופית מיד.",
            "- אם הסטודנט טועה — הסבר למה זה שגוי בעדינות, ותן רמז לכיוון הנכון.",
            "- התאם את רמת ההסבר — אם שואלים שאלה בסיסית, הסבר מהיסוד. אם מתקדמת, דלג על הבסיס.",
            "- היה תמציתי אבל שלם. אל תחסוך מידע חשוב, אבל אל תמלא טקסט מיותר.",
            "- אם אתה לא בטוח — אמור זאת במפורש, אל תמציא.",
        ]

        if memory_context:
            system_parts.append(f"\n\n## מה שאני זוכר עליך מפגישות קודמות:\n{memory_context}")
        if course_context:
            system_parts.append(f"\n\n## הקשר הקורס הנוכחי:\n{course_context}")
        if notes_context:
            system_parts.append(f"\n\n## סיכומים והערות של הסטודנט:\n{notes_context}")
        if context:
            system_parts.append(f"\n\n## הקשר נוסף:\n{context}")
        if web_context:
            system_parts.append(f"\n\n{web_context}")
            system_parts.append("\nהשתמש במידע מהאינטרנט כשהוא רלוונטי, אבל ציין שמדובר במקור חיצוני. אם יש סתירה בין החומר של הסטודנט לבין האינטרנט, העדף את החומר של הסטודנט.")

        system = "\n".join(system_parts)

        resp = self.client.messages.create(
            model=self.model,
            max_tokens=3000,
            system=system,
            messages=messages,
        )
        answer = resp.content[0].text
        messages.append({"role": "assistant", "content": answer})

        # Log interaction to memory for future learning
        self._log_interaction(question, answer, course_name, "chat")

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


# Singleton
_orchestrator: Optional[StudyOrchestrator] = None


def get_orchestrator() -> StudyOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = StudyOrchestrator()
    return _orchestrator
