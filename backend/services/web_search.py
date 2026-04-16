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
    """Heuristic: decide if a question needs web search.

    Returns True for questions that likely need current/external info.
    Returns False for simple conversational/personal questions.
    """
    q = question.lower().strip()

    # Skip search for very short or conversational messages
    if len(q) < 10:
        return False

    skip_patterns = [
        'שלום', 'היי', 'תודה', 'ביי', 'מה שלומך', 'בוקר טוב',
        'hello', 'hi', 'thanks', 'bye',
    ]
    for pattern in skip_patterns:
        if q.startswith(pattern):
            return False

    # Search for academic/knowledge questions
    search_indicators = [
        'מה זה', 'מהו', 'מהי', 'הסבר', 'הגדרה', 'למה', 'איך',
        'what is', 'how does', 'explain', 'define', 'why',
        'אלגוריתם', 'נוסחה', 'תיאוריה', 'חוק', 'עקרון',
        'algorithm', 'formula', 'theorem', 'principle',
        'דוגמה', 'example', 'השווה', 'compare',
        'מחקר', 'research', 'מאמר', 'paper',
    ]
    for indicator in search_indicators:
        if indicator in q:
            return True

    # Search if question is long enough (likely academic)
    if len(q) > 30:
        return True

    return False
