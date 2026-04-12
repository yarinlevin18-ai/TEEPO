"""
Content Extraction Agent - חולץ מבנה קורס מ-Udemy, Coursera וכתובות URL מותאמות.
"""
import json
import re
from typing import Dict, Any
from agents.base_study_agent import BaseStudyAgent


class ContentExtractionAgent(BaseStudyAgent):
    name = "content_extraction"
    description = "חולץ מבנה קורס מ-Udemy, Coursera וכל כתובת URL"

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        url: str = input_data.get("url", "")
        if not url:
            return {"status": "error", "message": "לא סופקה כתובת URL"}

        try:
            if "udemy.com" in url:
                return self._extract_udemy(url)
            elif "coursera.org" in url:
                return self._extract_coursera(url)
            else:
                return self._extract_generic(url)
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    # ------------------------------------------------------------------ #
    #  Udemy                                                               #
    # ------------------------------------------------------------------ #

    def _extract_udemy(self, url: str) -> Dict:
        """חילוץ מבנה קורס מ-Udemy."""
        import requests
        from bs4 import BeautifulSoup

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0 Safari/537.36"
            )
        }
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract title
        title_tag = (
            soup.find("h1", {"data-purpose": "lead-title"})
            or soup.find("h1", class_=re.compile(r"title", re.I))
            or soup.find("h1")
        )
        title = title_tag.get_text(strip=True) if title_tag else "קורס Udemy"

        # Extract description
        desc_tag = soup.find("div", {"data-purpose": "course-description"}) or soup.find(
            "div", class_=re.compile(r"description", re.I)
        )
        description = desc_tag.get_text(strip=True)[:500] if desc_tag else ""

        # Extract curriculum sections
        sections = []
        section_tags = soup.find_all("div", {"data-purpose": "curriculum-section-heading"}) or \
                       soup.find_all("div", class_=re.compile(r"section--title", re.I))
        for i, sec in enumerate(section_tags):
            sections.append({"title": sec.get_text(strip=True), "order": i + 1, "lessons": []})

        # If we couldn't parse sections, use AI to analyse the page
        if not sections:
            return self._ai_extract(url, resp.text[:8000], "Udemy")

        return {
            "status": "success",
            "source": "udemy",
            "url": url,
            "title": title,
            "description": description,
            "sections": sections,
        }

    # ------------------------------------------------------------------ #
    #  Coursera                                                            #
    # ------------------------------------------------------------------ #

    def _extract_coursera(self, url: str) -> Dict:
        """חילוץ מבנה קורס מ-Coursera."""
        import requests
        from bs4 import BeautifulSoup

        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        title_tag = soup.find("h1") or soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else "קורס Coursera"

        # Try to extract weeks/modules
        sections = []
        week_tags = soup.find_all("h3", class_=re.compile(r"week|module", re.I))
        for i, w in enumerate(week_tags):
            sections.append({"title": w.get_text(strip=True), "order": i + 1, "lessons": []})

        if not sections:
            return self._ai_extract(url, resp.text[:8000], "Coursera")

        return {
            "status": "success",
            "source": "coursera",
            "url": url,
            "title": title,
            "description": "",
            "sections": sections,
        }

    # ------------------------------------------------------------------ #
    #  Generic URL                                                         #
    # ------------------------------------------------------------------ #

    def _extract_generic(self, url: str) -> Dict:
        """חילוץ תוכן מכל כתובת URL."""
        import requests
        from bs4 import BeautifulSoup

        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove scripts and styles
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()

        title = soup.find("title")
        title_text = title.get_text(strip=True) if title else url

        body_text = soup.get_text(separator="\n", strip=True)[:6000]

        return self._ai_extract(url, body_text, "כתובת URL", title_text)

    # ------------------------------------------------------------------ #
    #  AI fallback                                                         #
    # ------------------------------------------------------------------ #

    def _ai_extract(self, url: str, page_content: str, source: str, title: str = "") -> Dict:
        """שימוש ב-Claude לחילוץ מבנה הקורס כשה-HTML parsing נכשל."""
        prompt = f"""אתה מנתח תוכן לימודי מ-{source}.

כתובת: {url}
תוכן הדף:
{page_content}

אנא חלץ את מבנה הקורס ב-JSON:
{{
  "title": "שם הקורס",
  "description": "תיאור קצר",
  "sections": [
    {{
      "title": "שם פרק",
      "order": 1,
      "lessons": [
        {{"title": "שם שיעור", "order": 1, "duration_minutes": 0}}
      ]
    }}
  ]
}}

אם אין מבנה קורס, חלץ את הנושאים הראשיים כפרקים."""

        raw = self._call_claude(prompt)
        try:
            # Find JSON block in response
            match = re.search(r"\{[\s\S]+\}", raw)
            if match:
                data = json.loads(match.group())
                data["status"] = "success"
                data["source"] = source.lower()
                data["url"] = url
                return data
        except Exception:
            pass

        return {
            "status": "success",
            "source": source.lower(),
            "url": url,
            "title": title or url,
            "description": raw[:300],
            "sections": [],
        }
