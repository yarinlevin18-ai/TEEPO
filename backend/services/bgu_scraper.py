"""
BGU Scraper - חילוץ מידע מאתרי בן-גוריון
מחייב כניסה חד-פעמית דרך הדפדפן, לאחר מכן עובד אוטומטית.

Sites:
  - Moodle:     https://moodle.bgu.ac.il
  - My portal:  https://my.bgu.ac.il
"""
import json
import os
import time
import re
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

# --------------------------------------------------------------------------- #
#  Paths                                                                        #
# --------------------------------------------------------------------------- #
COOKIES_DIR = Path(__file__).parent.parent / "data"
MOODLE_COOKIES_FILE = COOKIES_DIR / "moodle_cookies.json"
PORTAL_COOKIES_FILE = COOKIES_DIR / "portal_cookies.json"
COOKIES_DIR.mkdir(exist_ok=True)

MOODLE_URL = "https://moodle.bgu.ac.il/moodle"
PORTAL_URL = "https://my.bgu.ac.il"


# --------------------------------------------------------------------------- #
#  Session management                                                           #
# --------------------------------------------------------------------------- #

def _save_cookies(driver, filepath: Path):
    cookies = driver.get_cookies()
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)


def _load_cookies(filepath: Path) -> Optional[list]:
    if not filepath.exists():
        return None
    with open(filepath, encoding="utf-8") as f:
        return json.load(f)


def _build_session(cookies: list) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0 Safari/537.36"
        )
    })
    for c in cookies:
        session.cookies.set(c["name"], c["value"], domain=c.get("domain", ""))
    return session


def _is_logged_in(session: requests.Session, url: str, logged_in_indicator: str) -> bool:
    try:
        resp = session.get(url, timeout=10)
        return logged_in_indicator in resp.text
    except Exception:
        return False


# --------------------------------------------------------------------------- #
#  Login flow (Selenium - opens real browser for user to log in)               #
# --------------------------------------------------------------------------- #

def _get_app_chrome_profile() -> Path:
    """Dedicated Chrome profile directory for this app (never touches main Chrome)."""
    profile_dir = COOKIES_DIR / "chrome_profile"
    profile_dir.mkdir(exist_ok=True)
    return profile_dir


def open_browser_for_login(site: str = "moodle") -> dict:
    """
    Opens a dedicated Chrome window (separate from the user's main Chrome)
    so the user can log in to BGU. Saves cookies and closes.
    The user's normal Chrome is never touched.
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager

    if site == "moodle":
        cookies_file = MOODLE_COOKIES_FILE
        target_url = f"{MOODLE_URL}/my/"
        def logged_in_check(url):
            if "moodle.bgu.ac.il" not in url:
                return False
            bad = ("login/index", "login.php", "shibboleth", "adfs", "saml", "wayf", "idp")
            return not any(b in url.lower() for b in bad)
    else:
        cookies_file = PORTAL_COOKIES_FILE
        target_url = PORTAL_URL
        def logged_in_check(url):
            if "my.bgu.ac.il" not in url:
                return False
            bad = ("login", "shibboleth", "adfs", "saml")
            return not any(b in url.lower() for b in bad)

    app_profile = _get_app_chrome_profile()
    print(f"[BGU] Using dedicated app Chrome profile: {app_profile}")

    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    # Use dedicated profile — never touches main Chrome
    options.add_argument(f"--user-data-dir={str(app_profile)}")
    options.add_argument("--profile-directory=Default")

    try:
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options,
        )
        driver.execute_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        print(f"[BGU] Navigating to {target_url}")
        driver.get(target_url)

        timeout = 300  # 5 min if login needed
        start = time.time()
        logged_in = False
        last_url = ""

        while time.time() - start < timeout:
            time.sleep(1.5)
            try:
                current_url = driver.current_url
            except Exception:
                print("[BGU] Browser closed unexpectedly.")
                break  # browser closed

            if current_url != last_url:
                print(f"[BGU] URL changed → {current_url}")
                last_url = current_url

            if logged_in_check(current_url):
                time.sleep(2)  # wait for page to fully load cookies
                _save_cookies(driver, cookies_file)
                logged_in = True
                print("[BGU] Logged in! Cookies saved.")
                break

        if not logged_in:
            # Save whatever cookies exist as a fallback
            try:
                _save_cookies(driver, cookies_file)
                return {"status": "success", "message": "Session נשמר — נסה לסנכרן"}
            except Exception:
                return {"status": "timeout", "message": "לא הצלחנו לזהות כניסה"}

        return {"status": "success", "message": f"מחובר בהצלחה ל-{site}"}

    except Exception as e:
        print(f"[BGU] Error: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def is_session_valid(site: str = "moodle") -> bool:
    """Check if saved cookies are still valid."""
    if site == "moodle":
        cookies = _load_cookies(MOODLE_COOKIES_FILE)
        indicator = "data-userid"
        url = f"{MOODLE_URL}/my/"
    else:
        cookies = _load_cookies(PORTAL_COOKIES_FILE)
        indicator = "studentId"
        url = PORTAL_URL

    if not cookies:
        return False
    session = _build_session(cookies)
    return _is_logged_in(session, url, indicator)


# --------------------------------------------------------------------------- #
#  Moodle Scraper                                                               #
# --------------------------------------------------------------------------- #

def scrape_moodle_courses() -> dict:
    """Scrape all enrolled courses from Moodle."""
    cookies = _load_cookies(MOODLE_COOKIES_FILE)
    if not cookies:
        return {"status": "error", "message": "לא מחובר ל-Moodle. אנא התחבר תחילה."}

    session = _build_session(cookies)

    try:
        resp = session.get(f"{MOODLE_URL}/my/", timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        courses = []

        # Try Moodle's course list structure
        course_items = (
            soup.find_all("div", {"data-region": "course-content"})
            or soup.find_all("div", class_=re.compile(r"coursename|course-title", re.I))
            or soup.find_all("h3", class_=re.compile(r"coursename", re.I))
            or soup.find_all("a", {"data-type": "course"})
        )

        for item in course_items:
            link = item if item.name == "a" else item.find("a")
            if not link:
                continue
            href = link.get("href", "")
            if "course/view.php" not in href:
                continue
            title = link.get_text(strip=True)
            course_id = re.search(r"id=(\d+)", href)
            courses.append({
                "title": title,
                "url": href if href.startswith("http") else f"{MOODLE_URL}{href}",
                "moodle_id": course_id.group(1) if course_id else None,
            })

        # Fallback: try the enrolled courses API endpoint
        if not courses:
            api_resp = session.get(f"{MOODLE_URL}/lib/ajax/service.php", timeout=10)
            # Try direct course listing page
            resp2 = session.get(f"{MOODLE_URL}/course/", timeout=15)
            soup2 = BeautifulSoup(resp2.text, "html.parser")
            for a in soup2.find_all("a", href=re.compile(r"course/view\.php\?id=\d+")):
                title = a.get_text(strip=True)
                if title and len(title) > 2:
                    href = a["href"]
                    course_id = re.search(r"id=(\d+)", href)
                    if not any(c["url"] == href for c in courses):
                        courses.append({
                            "title": title,
                            "url": href if href.startswith("http") else f"{MOODLE_URL}{href}",
                            "moodle_id": course_id.group(1) if course_id else None,
                        })

        return {"status": "success", "courses": courses, "count": len(courses)}

    except Exception as e:
        return {"status": "error", "message": str(e)}


def scrape_course_assignments(course_url: str) -> dict:
    """Scrape assignments for a specific Moodle course."""
    cookies = _load_cookies(MOODLE_COOKIES_FILE)
    if not cookies:
        return {"status": "error", "message": "לא מחובר"}

    session = _build_session(cookies)

    try:
        resp = session.get(course_url, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        assignments = []

        # Find assignment activities
        assign_links = soup.find_all("a", href=re.compile(r"mod/assign/view\.php"))
        for link in assign_links:
            title = link.get_text(strip=True)
            href = link["href"]
            if not href.startswith("http"):
                href = f"{MOODLE_URL}{href}"

            # Try to get deadline from parent element
            parent = link.find_parent("li") or link.find_parent("div")
            deadline_text = ""
            if parent:
                date_span = parent.find(string=re.compile(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"))
                if date_span:
                    deadline_text = str(date_span).strip()

            assignments.append({
                "title": title,
                "url": href,
                "deadline_text": deadline_text,
            })

        return {"status": "success", "assignments": assignments}

    except Exception as e:
        return {"status": "error", "message": str(e)}


def scrape_course_materials(course_url: str) -> dict:
    """Scrape materials (PDFs, slides, links) from a Moodle course."""
    cookies = _load_cookies(MOODLE_COOKIES_FILE)
    if not cookies:
        return {"status": "error", "message": "לא מחובר"}

    session = _build_session(cookies)

    try:
        resp = session.get(course_url, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        materials = []

        # PDFs and resources
        resource_links = soup.find_all("a", href=re.compile(r"mod/resource/view\.php"))
        for link in resource_links:
            materials.append({
                "title": link.get_text(strip=True),
                "url": link["href"] if link["href"].startswith("http") else f"{MOODLE_URL}{link['href']}",
                "type": "resource",
            })

        # Forum links
        for link in soup.find_all("a", href=re.compile(r"mod/forum/view\.php")):
            materials.append({
                "title": link.get_text(strip=True),
                "url": link["href"] if link["href"].startswith("http") else f"{MOODLE_URL}{link['href']}",
                "type": "forum",
            })

        # Section titles (course structure)
        sections = []
        for section in soup.find_all(class_=re.compile(r"sectionname|section-title", re.I)):
            text = section.get_text(strip=True)
            if text:
                sections.append(text)

        return {"status": "success", "materials": materials, "sections": sections}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# --------------------------------------------------------------------------- #
#  My BGU Portal Scraper                                                        #
# --------------------------------------------------------------------------- #

def scrape_portal_schedule() -> dict:
    """Scrape class schedule from my.bgu.ac.il."""
    cookies = _load_cookies(PORTAL_COOKIES_FILE)
    if not cookies:
        return {"status": "error", "message": "לא מחובר לפורטל. אנא התחבר תחילה."}

    session = _build_session(cookies)

    try:
        # Try common schedule endpoints
        for path in ["/pls/scwp/!scwp.main", "/schedule", "/timetable", "/"]:
            resp = session.get(f"{PORTAL_URL}{path}", timeout=15)
            if resp.status_code == 200 and len(resp.text) > 500:
                soup = BeautifulSoup(resp.text, "html.parser")
                # Look for schedule table
                tables = soup.find_all("table")
                schedule = []
                for table in tables:
                    rows = table.find_all("tr")
                    for row in rows[1:]:
                        cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                        if len(cells) >= 3 and any(cells):
                            schedule.append(cells)
                if schedule:
                    return {"status": "success", "schedule": schedule}

        return {"status": "partial", "message": "הפורטל נטען אך לא נמצאה מערכת שעות. ייתכן שיש צורך בניווט ידני."}

    except Exception as e:
        return {"status": "error", "message": str(e)}
