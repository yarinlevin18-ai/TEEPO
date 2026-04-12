"""
BGU Scraper - חילוץ מידע מאתרי בן-גוריון

Modes:
  LOCAL  (IS_SERVER=False) — opens visible Chrome window for user to log in
  SERVER (IS_SERVER=True)  — headless Chrome, logs in with credentials, stores cookies in Supabase
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
#  Environment detection                                                        #
# --------------------------------------------------------------------------- #
IS_SERVER = os.getenv("RENDER", "").lower() in ("true", "1", "yes")

# --------------------------------------------------------------------------- #
#  Paths (local fallback)                                                       #
# --------------------------------------------------------------------------- #
COOKIES_DIR = Path(__file__).parent.parent / "data"
MOODLE_COOKIES_FILE = COOKIES_DIR / "moodle_cookies.json"
PORTAL_COOKIES_FILE = COOKIES_DIR / "portal_cookies.json"
COOKIES_DIR.mkdir(exist_ok=True)

MOODLE_URL = "https://moodle.bgu.ac.il/moodle"
PORTAL_URL = "https://my.bgu.ac.il"


# --------------------------------------------------------------------------- #
#  Cookie storage (Supabase on server, local files in dev)                      #
# --------------------------------------------------------------------------- #

def _save_cookies_to_store(site: str, cookies: list):
    """Save cookies — Supabase on server, local file in dev."""
    if IS_SERVER:
        try:
            from services.supabase_client import get_client
            get_client().table("bgu_sessions").upsert({
                "site": site,
                "cookies": json.dumps(cookies),
                "updated_at": "now()",
            }, on_conflict="site").execute()
            print(f"[BGU] Cookies saved to Supabase for {site}")
        except Exception as e:
            print(f"[BGU] Warning: could not save cookies to Supabase: {e}")
    else:
        filepath = MOODLE_COOKIES_FILE if site == "moodle" else PORTAL_COOKIES_FILE
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(cookies, f, ensure_ascii=False, indent=2)
        print(f"[BGU] Cookies saved to file for {site}")


def _load_cookies_from_store(site: str) -> Optional[list]:
    """Load cookies — Supabase on server, local file in dev."""
    if IS_SERVER:
        try:
            from services.supabase_client import get_client
            result = get_client().table("bgu_sessions").select("cookies").eq("site", site).execute()
            if result.data:
                return json.loads(result.data[0]["cookies"])
        except Exception as e:
            print(f"[BGU] Warning: could not load cookies from Supabase: {e}")
        return None
    else:
        filepath = MOODLE_COOKIES_FILE if site == "moodle" else PORTAL_COOKIES_FILE
        if not filepath.exists():
            return None
        with open(filepath, encoding="utf-8") as f:
            return json.load(f)


# Keep local file helpers for Selenium callback
def _save_cookies(driver, filepath: Path):
    cookies = driver.get_cookies()
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)


def _load_cookies(filepath: Path) -> Optional[list]:
    if not filepath.exists():
        return None
    with open(filepath, encoding="utf-8") as f:
        return json.load(f)


# --------------------------------------------------------------------------- #
#  Session helpers                                                              #
# --------------------------------------------------------------------------- #

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
#  Login — SERVER mode (headless, credential-based)                            #
# --------------------------------------------------------------------------- #

def login_headless(site: str, username: str, password: str) -> dict:
    """
    Logs in to BGU headlessly using credentials.
    Used when backend runs on Render/cloud.
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager

    if site == "moodle":
        target_url = f"{MOODLE_URL}/login/index.php"
        success_check = lambda url: "moodle.bgu.ac.il" in url and not any(
            b in url.lower() for b in ("login", "shibboleth", "adfs", "saml", "wayf", "idp")
        )
    else:
        target_url = f"{PORTAL_URL}/login"
        success_check = lambda url: "my.bgu.ac.il" in url and "login" not in url.lower()

    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1280,900")
    options.add_argument("--disable-blink-features=AutomationControlled")

    try:
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=options,
        )
        wait = WebDriverWait(driver, 20)

        print(f"[BGU] Headless login → {target_url}")
        driver.get(target_url)
        time.sleep(3)

        # Try to find and fill username/password fields (handles most SSO forms)
        for user_sel in ["#username", "input[name='username']", "input[name='j_username']",
                         "input[type='text']", "input[name='userid']"]:
            try:
                field = driver.find_element(By.CSS_SELECTOR, user_sel)
                field.clear()
                field.send_keys(username)
                print(f"[BGU] Filled username field: {user_sel}")
                break
            except Exception:
                continue

        for pass_sel in ["#password", "input[name='password']", "input[name='j_password']",
                         "input[type='password']"]:
            try:
                field = driver.find_element(By.CSS_SELECTOR, pass_sel)
                field.clear()
                field.send_keys(password)
                print(f"[BGU] Filled password field: {pass_sel}")
                break
            except Exception:
                continue

        # Submit
        for submit_sel in ["button[type='submit']", "input[type='submit']", "#loginbtn", ".btn-primary"]:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, submit_sel)
                btn.click()
                print(f"[BGU] Clicked submit: {submit_sel}")
                break
            except Exception:
                continue

        # Wait for redirect to success page (up to 60s for SSO)
        timeout = 60
        start = time.time()
        last_url = ""
        logged_in = False

        while time.time() - start < timeout:
            time.sleep(2)
            try:
                current_url = driver.current_url
            except Exception:
                break

            if current_url != last_url:
                print(f"[BGU] URL → {current_url}")
                last_url = current_url

            if success_check(current_url):
                time.sleep(2)
                cookies = driver.get_cookies()
                _save_cookies_to_store(site, cookies)
                logged_in = True
                print("[BGU] Headless login successful!")
                break

        if not logged_in:
            page_title = driver.title
            return {"status": "error", "message": f"ההתחברות נכשלה. עמוד נוכחי: {page_title}"}

        return {"status": "success", "message": f"מחובר בהצלחה ל-{site}"}

    except Exception as e:
        print(f"[BGU] Headless login error: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        try:
            driver.quit()
        except Exception:
            pass


# --------------------------------------------------------------------------- #
#  Login — LOCAL mode (visible browser, user logs in manually)                 #
# --------------------------------------------------------------------------- #

def _get_app_chrome_profile() -> Path:
    """Dedicated Chrome profile directory for this app (never touches main Chrome)."""
    profile_dir = COOKIES_DIR / "chrome_profile"
    profile_dir.mkdir(exist_ok=True)
    return profile_dir


def open_browser_for_login(site: str = "moodle") -> dict:
    """
    Opens a dedicated Chrome window for the user to log in manually.
    Only used in local/dev mode. On server, use login_headless() instead.
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

        timeout = 300
        start = time.time()
        logged_in = False
        last_url = ""

        while time.time() - start < timeout:
            time.sleep(1.5)
            try:
                current_url = driver.current_url
            except Exception:
                print("[BGU] Browser closed unexpectedly.")
                break

            if current_url != last_url:
                print(f"[BGU] URL changed → {current_url}")
                last_url = current_url

            if logged_in_check(current_url):
                time.sleep(2)
                cookies = driver.get_cookies()
                _save_cookies(driver, cookies_file)
                _save_cookies_to_store(site, cookies)
                logged_in = True
                print("[BGU] Logged in! Cookies saved.")
                break

        if not logged_in:
            try:
                cookies = driver.get_cookies()
                _save_cookies(driver, cookies_file)
                _save_cookies_to_store(site, cookies)
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
    cookies = _load_cookies_from_store(site)
    if not cookies:
        return False

    if site == "moodle":
        indicator = "data-userid"
        url = f"{MOODLE_URL}/my/"
    else:
        indicator = "studentId"
        url = PORTAL_URL

    session = _build_session(cookies)
    return _is_logged_in(session, url, indicator)


# --------------------------------------------------------------------------- #
#  Moodle Scraper                                                               #
# --------------------------------------------------------------------------- #

def scrape_moodle_courses() -> dict:
    """Scrape all enrolled courses from Moodle."""
    cookies = _load_cookies_from_store("moodle")
    if not cookies:
        return {"status": "error", "message": "לא מחובר ל-Moodle. אנא התחבר תחילה."}

    session = _build_session(cookies)

    try:
        resp = session.get(f"{MOODLE_URL}/my/", timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        courses = []

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

        if not courses:
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
    cookies = _load_cookies_from_store("moodle")
    if not cookies:
        return {"status": "error", "message": "לא מחובר"}

    session = _build_session(cookies)

    try:
        resp = session.get(course_url, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        assignments = []
        assign_links = soup.find_all("a", href=re.compile(r"mod/assign/view\.php"))
        for link in assign_links:
            title = link.get_text(strip=True)
            href = link["href"]
            if not href.startswith("http"):
                href = f"{MOODLE_URL}{href}"
            parent = link.find_parent("li") or link.find_parent("div")
            deadline_text = ""
            if parent:
                date_span = parent.find(string=re.compile(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"))
                if date_span:
                    deadline_text = str(date_span).strip()
            assignments.append({"title": title, "url": href, "deadline_text": deadline_text})

        return {"status": "success", "assignments": assignments}

    except Exception as e:
        return {"status": "error", "message": str(e)}


def scrape_course_materials(course_url: str) -> dict:
    cookies = _load_cookies_from_store("moodle")
    if not cookies:
        return {"status": "error", "message": "לא מחובר"}

    session = _build_session(cookies)

    try:
        resp = session.get(course_url, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        materials = []
        for link in soup.find_all("a", href=re.compile(r"mod/resource/view\.php")):
            materials.append({
                "title": link.get_text(strip=True),
                "url": link["href"] if link["href"].startswith("http") else f"{MOODLE_URL}{link['href']}",
                "type": "resource",
            })
        for link in soup.find_all("a", href=re.compile(r"mod/forum/view\.php")):
            materials.append({
                "title": link.get_text(strip=True),
                "url": link["href"] if link["href"].startswith("http") else f"{MOODLE_URL}{link['href']}",
                "type": "forum",
            })

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
    cookies = _load_cookies_from_store("portal")
    if not cookies:
        return {"status": "error", "message": "לא מחובר לפורטל. אנא התחבר תחילה."}

    session = _build_session(cookies)

    try:
        for path in ["/pls/scwp/!scwp.main", "/schedule", "/timetable", "/"]:
            resp = session.get(f"{PORTAL_URL}{path}", timeout=15)
            if resp.status_code == 200 and len(resp.text) > 500:
                soup = BeautifulSoup(resp.text, "html.parser")
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

        return {"status": "partial", "message": "הפורטל נטען אך לא נמצאה מערכת שעות."}

    except Exception as e:
        return {"status": "error", "message": str(e)}
