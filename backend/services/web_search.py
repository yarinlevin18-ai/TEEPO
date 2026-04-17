"""Web search utility using DuckDuckGo — no API key required."""
from config import logger


def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Search the web using DuckDuckGo and return results.

    Returns list of dicts with keys: title, body, href
    """
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            logger.debug(f"[web_search] '{query}' → {len(results)} results")
            return results
    except Exception as e:
        logger.warning(f"[web_search] search failed: {e}")
        return []


def format_search_results(results: list[dict], max_chars: int = 3000) -> str:
    """Format search results into a readable context string for the AI."""
    if not results:
        return ""

    parts = ["## תוצאות חיפוש באינטרנט:"]
    total = 0
    for i, r in enumerate(results, 1):
        title = r.get("title", "")
        body = r.get("body", "")
        href = r.get("href", "")
        entry = f"\n{i}. **{title}**\n   {body}\n   מקור: {href}"
        if total + len(entry) > max_chars:
            break
        parts.append(entry)
        total += len(entry)

    return "\n".join(parts)


def should_search(question: str) -> bool:
    """Decide if a question needs web search.

    Returns True for questions that likely need current/external info.
    Returns False for simple conversational/personal messages.
    """
    q = question.lower().strip()

    # Skip search for very short messages
    if len(q) < 8:
        return False

    # Skip greetings and short conversational messages
    skip_patterns = [
        'שלום', 'היי', 'תודה', 'ביי', 'מה שלומך', 'בוקר טוב',
        'ערב טוב', 'לילה טוב', 'מה נשמע', 'אוקיי', 'בסדר',
        'hello', 'hi', 'thanks', 'bye', 'ok', 'sure', 'yes', 'no',
        'כן', 'לא', 'סבבה', 'יופי', 'תמשיך', 'עוד',
    ]
    for pattern in skip_patterns:
        if q.startswith(pattern) or q == pattern:
            return False

    # Skip task-management type messages (not knowledge questions)
    task_patterns = [
        'תזכיר לי', 'תוסיף משימה', 'מה המשימות', 'מה יש לי',
    ]
    for pattern in task_patterns:
        if q.startswith(pattern):
            return False

    # Always search for explicit knowledge questions
    search_indicators = [
        'מה זה', 'מהו', 'מהי', 'מה ה', 'הסבר', 'הגדרה', 'למה',
        'איך', 'מתי', 'כמה', 'האם', 'מי', 'איפה', 'איזה',
        'what is', 'how does', 'explain', 'define', 'why', 'when',
        'who', 'where', 'which', 'how to', 'how many',
        'אלגוריתם', 'נוסחה', 'תיאוריה', 'חוק', 'עקרון', 'מושג',
        'algorithm', 'formula', 'theorem', 'principle', 'concept',
        'דוגמה', 'example', 'השווה', 'compare', 'הבדל', 'difference',
        'מחקר', 'research', 'מאמר', 'paper', 'פתרון', 'solution',
        'python', 'java', 'code', 'קוד', 'תכנות', 'programming',
        'סיבוכיות', 'complexity', 'big o', 'ביג או',
        'הוכחה', 'proof', 'משפט', 'theorem', 'למה', 'lemma',
    ]
    for indicator in search_indicators:
        if indicator in q:
            return True

    # Search if question is moderately long (likely academic)
    if len(q) > 20:
        return True

    return False
