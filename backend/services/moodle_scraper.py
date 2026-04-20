"""
University LMS Scraper - Moodle + optional legacy Portal integration.

Modes:
  LOCAL  (IS_SERVER=False) — opens visible Chrome window for user to log in
  SERVER (IS_SERVER=True)  — headless Chrome, logs in with credentials, stores cookies in Supabase

URLs are loaded from env vars (MOODLE_URL / PORTAL_URL / PORTAL_URL_OLD) so the
platform supports any university that uses Moodle, not just a specific school.
"""
import json
import os
import time
import re
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup
from config import (
    logger,
    MOODLE_URL as _CFG_MOODLE_URL,
    PORTAL_URL as _CFG_PORTAL_URL,
    PORTAL_URL_OLD as _CFG_PORTAL_URL_OLD,
)

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

# Read from config at import time. Deploys without MOODLE_URL simply can't use
# the Moodle feature — the /moodle UI checks the info endpoint and hides
# the tab instead of crashing.
MOODLE_URL = _CFG_MOODLE_URL
PORTAL_URL = _CFG_PORTAL_URL
PORTAL_URL_OLD = _CFG_PORTAL_URL_OLD


# --------------------------------------------------------------------------- #
#  Cookie storage (Supabase on server, local files in dev)                      #
# --------------------------------------------------------------------------- #

def _save_cookies_to_store(site: str, cookies: list):
    """Save cookies to BOTH local file and Supabase for maximum persistence."""
    from datetime import datetime as _dt

    # Always save to local file (fast, works in dev)
    filepath = MOODLE_COOKIES_FILE if site == "moodle" else PORTAL_COOKIES_FILE
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(cookies, f, ensure_ascii=False, indent=2)
        logger.debug(f"[BGU] Cookies saved to local file for {site}")
    except Exception as e:
        logger.debug(f"[BGU] Warning: could not save cookies to file: {e}")

    # Also save to Supabase (persists across Render restarts)
    try:
        from services.supabase_client import get_client
        get_client().table("bgu_sessions").upsert({
            "site": site,
            "cookies": json.dumps(cookies),
            "updated_at": _dt.utcnow().isoformat(),
        }, on_conflict="site").execute()
        logger.debug(f"[BGU] Cookies saved to Supabase for {site}")
    except Exception as e:
        logger.debug(f"[BGU] Warning: could not save cookies to Supabase: {e}")


def _load_cookies_from_store(site: str) -> Optional[list]:
    """Load cookies — try Supabase first (persists restarts), fall back to local file."""
    # Try Supabase first
    try:
        from services.supabase_client import get_client
        result = get_client().table("bgu_sessions").select("cookies").eq("site", site).execute()
        if result.data:
            logger.debug(f"[BGU] Cookies loaded from Supabase for {site}")
            return json.loads(result.data[0]["cookies"])
    except Exception as e:
        logger.debug(f"[BGU] Warning: could not load cookies from Supabase: {e}")

    # Fall back to local file
    filepath = MOODLE_COOKIES_FILE if site == "moodle" else PORTAL_COOKIES_FILE
    if filepath.exists():
        try:
            with open(filepath, encoding="utf-8") as f:
                cookies = json.load(f)
            logger.debug(f"[BGU] Cookies loaded from local file for {site}")
            return cookies
        except Exception as e:
            logger.debug(f"[BGU] Warning: could not load cookies from file: {e}")

    logger.debug(f"[BGU] No cookies found for {site}")
    return None


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

        logger.debug(f"[BGU] Headless login → {target_url}")
        driver.get(target_url)
        time.sleep(3)

        # Try to find and fill username/password fields (handles most SSO forms)
        for user_sel in ["#username", "input[name='username']", "input[name='j_username']",
                         "input[type='text']", "input[name='userid']"]:
            try:
                field = driver.find_element(By.CSS_SELECTOR, user_sel)
                field.clear()
                field.send_keys(username)
                logger.debug(f"[BGU] Filled username field: {user_sel}")
                break
            except Exception:
                continue

        for pass_sel in ["#password", "input[name='password']", "input[name='j_password']",
                         "input[type='password']"]:
            try:
                field = driver.find_element(By.CSS_SELECTOR, pass_sel)
                field.clear()
                field.send_keys(password)
                logger.debug(f"[BGU] Filled password field: {pass_sel}")
                break
            except Exception:
                continue

        # Submit
        for submit_sel in ["button[type='submit']", "input[type='submit']", "#loginbtn", ".btn-primary"]:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, submit_sel)
                btn.click()
                logger.debug(f"[BGU] Clicked submit: {submit_sel}")
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
                logger.debug(f"[BGU] URL → {current_url}")
                last_url = current_url

            if success_check(current_url):
                time.sleep(2)
                cookies = driver.get_cookies()
                _save_cookies_to_store(site, cookies)
                logged_in = True
                logger.debug("[BGU] Headless login successful!")
                break

        if not logged_in:
            page_title = driver.title
            return {"status": "error", "message": f"ההתחברות נכשלה. עמוד נוכחי: {page_title}"}

        return {"status": "success", "message": f"מחובר בהצלחה ל-{site}"}

    except Exception as e:
        logger.debug(f"[BGU] Headless login error: {e}")
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
    logger.debug(f"[BGU] Using dedicated app Chrome profile: {app_profile}")

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

        logger.debug(f"[BGU] Navigating to {target_url}")
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
                logger.debug("[BGU] Browser closed unexpectedly.")
                break

            if current_url != last_url:
                logger.debug(f"[BGU] URL changed → {current_url}")
                last_url = current_url

            if logged_in_check(current_url):
                time.sleep(2)
                cookies = driver.get_cookies()
                _save_cookies(driver, cookies_file)
                _save_cookies_to_store(site, cookies)
                logged_in = True
                logger.debug("[BGU] Logged in! Cookies saved.")
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
        logger.debug(f"[BGU] Error: {e}")
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
    """Scrape all enrolled courses from Moodle using AJAX API + HTML fallback."""
    cookies = _load_cookies_from_store("moodle")
    if not cookies:
        return {"status": "error", "message": "לא מחובר ל-Moodle. אנא התחבר תחילה."}

    session = _build_session(cookies)
    courses = []

    # ── Strategy 1: Moodle AJAX service API (most reliable for Moodle 4.x) ──
    try:
        # Get sesskey from dashboard page
        resp = session.get(f"{MOODLE_URL}/my/", timeout=15)
        sesskey_match = re.search(r'"sesskey"\s*:\s*"([^"]+)"', resp.text)
        if not sesskey_match:
            sesskey_match = re.search(r'sesskey=([a-zA-Z0-9]+)', resp.text)
        sesskey = sesskey_match.group(1) if sesskey_match else None

        if sesskey:
            ajax_url = f"{MOODLE_URL}/lib/ajax/service.php?sesskey={sesskey}&info=core_course_get_enrolled_courses_by_timeline_classification"
            payload = [{
                "index": 0,
                "methodname": "core_course_get_enrolled_courses_by_timeline_classification",
                "args": {
                    "offset": 0,
                    "limit": 0,
                    "classification": "all",
                    "sort": "fullname",
                    "customfieldname": "",
                    "customfieldvalue": "",
                }
            }]
            ajax_resp = session.post(ajax_url, json=payload, timeout=15)
            data = ajax_resp.json()

            if isinstance(data, list) and data and data[0].get("error") is False:
                for course in data[0].get("data", {}).get("courses", []):
                    # Moodle gives us startdate/enddate as UNIX timestamps and
                    # shortname/categoryname as strings — all useful for
                    # classifying the course into year-of-study + semester.
                    courses.append({
                        "title": course.get("fullname", ""),
                        "url": course.get("viewurl", ""),
                        "moodle_id": str(course.get("id", "")),
                        "summary": course.get("summary", ""),
                        "shortname": course.get("shortname", ""),
                        "startdate": course.get("startdate") or None,
                        "enddate": course.get("enddate") or None,
                        "category_name": course.get("coursecategory") or "",
                    })
                logger.debug(f"[BGU] AJAX API found {len(courses)} courses")
    except Exception as e:
        logger.debug(f"[BGU] AJAX strategy failed: {e}")

    # ── Strategy 2: Scan ALL <a> tags for course/view.php links ──────────────
    if not courses:
        try:
            resp = session.get(f"{MOODLE_URL}/my/", timeout=15)
            soup = BeautifulSoup(resp.text, "html.parser")
            seen_ids = set()

            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "course/view.php" not in href:
                    continue
                course_id_match = re.search(r"id=(\d+)", href)
                if not course_id_match:
                    continue
                cid = course_id_match.group(1)
                if cid in seen_ids:
                    continue
                seen_ids.add(cid)
                title = a.get_text(strip=True)
                if not title or len(title) < 3:
                    # Try parent element text
                    title = a.find_parent().get_text(strip=True)[:100] if a.find_parent() else title
                if title and len(title) > 2:
                    courses.append({
                        "title": title,
                        "url": href if href.startswith("http") else f"{MOODLE_URL}{href}",
                        "moodle_id": cid,
                    })
            logger.debug(f"[BGU] HTML scan found {len(courses)} courses")
        except Exception as e:
            logger.debug(f"[BGU] HTML strategy failed: {e}")

    # ── Strategy 3: /course/ index page ──────────────────────────────────────
    if not courses:
        try:
            resp3 = session.get(f"{MOODLE_URL}/course/index.php", timeout=15)
            soup3 = BeautifulSoup(resp3.text, "html.parser")
            seen_ids = set()
            for a in soup3.find_all("a", href=re.compile(r"course/view\.php\?id=\d+")):
                href = a["href"]
                cid_match = re.search(r"id=(\d+)", href)
                if not cid_match:
                    continue
                cid = cid_match.group(1)
                if cid in seen_ids:
                    continue
                seen_ids.add(cid)
                title = a.get_text(strip=True)
                if title and len(title) > 2:
                    courses.append({
                        "title": title,
                        "url": href if href.startswith("http") else f"{MOODLE_URL}{href}",
                        "moodle_id": cid,
                    })
            logger.debug(f"[BGU] /course/ page found {len(courses)} courses")
        except Exception as e:
            logger.debug(f"[BGU] /course/ strategy failed: {e}")

    # Deduplicate by moodle_id
    seen = set()
    unique = []
    for c in courses:
        key = c.get("moodle_id") or c.get("url")
        if key not in seen:
            seen.add(key)
            unique.append(c)

    logger.debug(f"[BGU] Total unique courses found: {len(unique)}")
    return {"status": "success", "courses": unique, "count": len(unique)}


def _get_sesskey(session: requests.Session) -> Optional[str]:
    """Extract Moodle sesskey from dashboard page."""
    try:
        resp = session.get(f"{MOODLE_URL}/my/", timeout=15)
        m = re.search(r'"sesskey"\s*:\s*"([^"]+)"', resp.text)
        if not m:
            m = re.search(r'sesskey=([a-zA-Z0-9]+)', resp.text)
        return m.group(1) if m else None
    except Exception:
        return None


def _moodle_ajax(session: requests.Session, sesskey: str,
                 method: str, args: dict) -> Optional[list]:
    """Call a Moodle AJAX web service method."""
    ajax_url = f"{MOODLE_URL}/lib/ajax/service.php?sesskey={sesskey}&info={method}"
    payload = [{"index": 0, "methodname": method, "args": args}]
    try:
        resp = session.post(ajax_url, json=payload, timeout=20)
        data = resp.json()
        if isinstance(data, list) and data and data[0].get("error") is False:
            return data[0].get("data")
    except Exception as e:
        logger.debug(f"[BGU] AJAX {method} failed: {e}")
    return None


def scrape_all_assignments(course_ids: list = None) -> dict:
    """Fetch assignments for all enrolled courses via Moodle AJAX API.
    Much more reliable than per-course HTML scraping.
    Falls back to HTML scraping per course if AJAX fails."""
    cookies = _load_cookies_from_store("moodle")
    if not cookies:
        return {"status": "error", "message": "לא מחובר ל-Moodle."}

    session = _build_session(cookies)
    sesskey = _get_sesskey(session)
    assignments = []

    # ── Strategy 1: AJAX mod_assign_get_assignments ──
    if sesskey:
        try:
            args = {"courseids": course_ids} if course_ids else {"courseids": []}
            # If no course IDs provided, get them first
            if not course_ids:
                courses_result = scrape_moodle_courses()
                if courses_result.get("courses"):
                    args["courseids"] = [
                        int(c["moodle_id"]) for c in courses_result["courses"]
                        if c.get("moodle_id") and c["moodle_id"].isdigit()
                    ]

            if args["courseids"]:
                data = _moodle_ajax(session, sesskey, "mod_assign_get_assignments", args)
                if data and "courses" in data:
                    for course in data["courses"]:
                        course_name = course.get("fullname", "")
                        for assign in course.get("assignments", []):
                            deadline = None
                            if assign.get("duedate") and assign["duedate"] > 0:
                                from datetime import datetime, timezone
                                deadline = datetime.fromtimestamp(
                                    assign["duedate"], tz=timezone.utc
                                ).strftime("%Y-%m-%d")
                            assignments.append({
                                "title": assign.get("name", ""),
                                "url": f"{MOODLE_URL}/mod/assign/view.php?id={assign.get('cmid', '')}",
                                "moodle_id": str(assign.get("id", "")),
                                "course_name": course_name,
                                "course_moodle_id": str(course.get("id", "")),
                                "deadline": deadline,
                                "deadline_text": deadline or "",
                                "description": BeautifulSoup(
                                    assign.get("intro", ""), "html.parser"
                                ).get_text(strip=True)[:500],
                            })
                    logger.debug(f"[BGU] AJAX found {len(assignments)} assignments across {len(data['courses'])} courses")
                    if assignments:
                        return {"status": "success", "assignments": assignments, "count": len(assignments)}
        except Exception as e:
            logger.debug(f"[BGU] AJAX assignment fetch failed: {e}")

    # ── Strategy 2: Upcoming events API (calendar deadlines) ──
    if sesskey and not assignments:
        try:
            from datetime import datetime, timezone
            now_ts = int(datetime.now(timezone.utc).timestamp())
            future_ts = now_ts + (90 * 86400)  # 90 days ahead
            data = _moodle_ajax(session, sesskey, "core_calendar_get_action_events_by_timesort", {
                "timesortfrom": now_ts,
                "timesortto": future_ts,
                "limitnum": 50,
            })
            if data and "events" in data:
                for event in data["events"]:
                    if event.get("modulename") == "assign":
                        deadline = None
                        if event.get("timestart"):
                            deadline = datetime.fromtimestamp(
                                event["timestart"], tz=timezone.utc
                            ).strftime("%Y-%m-%d")
                        assignments.append({
                            "title": event.get("name", ""),
                            "url": event.get("url", ""),
                            "course_name": event.get("course", {}).get("fullname", ""),
                            "deadline": deadline,
                            "deadline_text": deadline or "",
                        })
                logger.debug(f"[BGU] Calendar API found {len(assignments)} assignment events")
                if assignments:
                    return {"status": "success", "assignments": assignments, "count": len(assignments)}
        except Exception as e:
            logger.debug(f"[BGU] Calendar strategy failed: {e}")

    logger.debug(f"[BGU] AJAX assignment strategies returned {len(assignments)} results")
    return {"status": "success", "assignments": assignments, "count": len(assignments)}


def scrape_course_assignments(course_url: str) -> dict:
    """Scrape assignments for a single course (HTML fallback)."""
    cookies = _load_cookies_from_store("moodle")
    if not cookies:
        return {"status": "error", "message": "לא מחובר"}

    session = _build_session(cookies)

    # Try AJAX first if we can extract course ID
    course_id_match = re.search(r"id=(\d+)", course_url)
    if course_id_match:
        sesskey = _get_sesskey(session)
        if sesskey:
            cid = int(course_id_match.group(1))
            data = _moodle_ajax(session, sesskey, "mod_assign_get_assignments", {"courseids": [cid]})
            if data and "courses" in data:
                assignments = []
                for course in data["courses"]:
                    for assign in course.get("assignments", []):
                        deadline = None
                        if assign.get("duedate") and assign["duedate"] > 0:
                            from datetime import datetime, timezone
                            deadline = datetime.fromtimestamp(
                                assign["duedate"], tz=timezone.utc
                            ).strftime("%Y-%m-%d")
                        assignments.append({
                            "title": assign.get("name", ""),
                            "url": f"{MOODLE_URL}/mod/assign/view.php?id={assign.get('cmid', '')}",
                            "deadline": deadline,
                            "deadline_text": deadline or "",
                        })
                if assignments:
                    return {"status": "success", "assignments": assignments}

    # HTML fallback
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

    # Try AJAX for course contents first
    course_id_match = re.search(r"id=(\d+)", course_url)
    if course_id_match:
        sesskey = _get_sesskey(session)
        if sesskey:
            cid = int(course_id_match.group(1))
            data = _moodle_ajax(session, sesskey, "core_course_get_contents", {"courseid": cid})
            if data:
                materials = []
                sections = []
                for section in data:
                    sec_name = section.get("name", "")
                    if sec_name:
                        sections.append(sec_name)
                    for module in section.get("modules", []):
                        mod_type = module.get("modname", "")
                        if mod_type in ("resource", "url", "folder", "page", "forum"):
                            materials.append({
                                "title": module.get("name", ""),
                                "url": module.get("url", ""),
                                "type": mod_type,
                                "description": module.get("description", ""),
                            })
                if materials or sections:
                    logger.debug(f"[BGU] AJAX found {len(materials)} materials, {len(sections)} sections")
                    return {"status": "success", "materials": materials, "sections": sections}

    # HTML fallback
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


# Cap each extracted PDF at 200KB of text — same as the client-side pdfjs
# extractor, so ingested sources don't blow out the Drive DB.
_PDF_MAX_CHARS = 200_000
# Skip PDFs bigger than 30MB — that's a textbook, not a slide deck, and
# fetching them over a slow BGU connection is too fragile.
_PDF_MAX_BYTES = 30 * 1024 * 1024


def _extract_pdf_text(pdf_bytes: bytes) -> tuple[str, int]:
    """Return (text, pages). Uses pypdf — fast enough for slide decks and
    correctly decodes Hebrew from BGU lecture PDFs. Caller should handle
    scanned PDFs separately (those return empty text here)."""
    from io import BytesIO
    try:
        from pypdf import PdfReader
    except ImportError:
        # pypdf isn't installed yet on Render until redeploy picks up the
        # updated requirements.txt. Fail soft so the rest of the ingest
        # flow can still report back gracefully.
        logger.warning("[BGU] pypdf not installed; skipping PDF text extraction")
        return "", 0

    reader = PdfReader(BytesIO(pdf_bytes))
    pieces: list[str] = []
    total = 0
    for i, page in enumerate(reader.pages, start=1):
        try:
            page_text = (page.extract_text() or "").strip()
        except Exception:
            page_text = ""
        chunk = f"\n\n--- עמוד {i} ---\n{page_text}"
        if total + len(chunk) > _PDF_MAX_CHARS:
            remaining = _PDF_MAX_CHARS - total
            if remaining > 0:
                pieces.append(chunk[:remaining])
            break
        pieces.append(chunk)
        total += len(chunk)
    return "".join(pieces), len(reader.pages)


def ingest_course_materials(course_url: str, max_pdfs: int = 20) -> dict:
    """
    Fetch all PDF materials from a Moodle course page and extract their text.
    Returns: {status, sources: [{title, content, pages, url, bytes}], skipped: [...]}

    PDF discovery strategy:
      1. AJAX core_course_get_contents to list modules with file info
      2. For each module of type 'resource', the URL is a mod/resource/view.php
         redirect — we need to follow it to hit the actual file stream.
      3. pluginfile.php URLs (direct links) are downloaded directly.
    """
    cookies = _load_cookies_from_store("moodle")
    if not cookies:
        return {"status": "error", "message": "לא מחובר ל-Moodle"}

    session = _build_session(cookies)

    course_id_match = re.search(r"id=(\d+)", course_url)
    if not course_id_match:
        return {"status": "error", "message": "לא זוהה מזהה קורס ב-URL"}
    cid = int(course_id_match.group(1))

    sesskey = _get_sesskey(session)
    if not sesskey:
        return {"status": "error", "message": "לא נמצא sesskey — ייתכן שה-session פג תוקף"}

    contents = _moodle_ajax(session, sesskey, "core_course_get_contents", {"courseid": cid})
    if not contents:
        return {"status": "error", "message": "שליפת תכני הקורס נכשלה"}

    # Collect candidate PDF URLs. Moodle exposes `contents` on each module
    # with `fileurl` pointing to pluginfile.php. That's the direct link.
    candidates: list[dict] = []
    for section in contents:
        for module in section.get("modules", []):
            modname = module.get("modname", "")
            mod_title = module.get("name", "").strip() or "ללא כותרת"
            # Direct files (resource / folder) expose `contents` array with fileurl.
            for f in module.get("contents", []) or []:
                mime = (f.get("mimetype") or "").lower()
                fname = (f.get("filename") or "").lower()
                fileurl = f.get("fileurl") or ""
                if not fileurl:
                    continue
                if "pdf" in mime or fname.endswith(".pdf"):
                    # pluginfile.php URLs need the sesskey appended as `token`
                    # query param or the cookies alone suffice for the session.
                    candidates.append({
                        "title": f.get("filename") or mod_title,
                        "url": fileurl,
                        "section": section.get("name", ""),
                        "module": mod_title,
                        "filesize": f.get("filesize") or 0,
                    })
            # Also accept the module itself if it's a resource with no
            # explicit `contents` payload — we'll probe mime via HEAD below.
            if modname == "resource" and not module.get("contents"):
                view_url = module.get("url", "")
                if view_url:
                    candidates.append({
                        "title": mod_title,
                        "url": view_url,
                        "section": section.get("name", ""),
                        "module": mod_title,
                        "filesize": 0,
                        "needs_probe": True,
                    })

    if not candidates:
        return {"status": "success", "sources": [], "skipped": [], "total_candidates": 0}

    candidates = candidates[:max_pdfs]

    sources: list[dict] = []
    skipped: list[dict] = []

    for c in candidates:
        title = c["title"]
        url = c["url"]
        try:
            # For view.php links, follow redirects. Moodle hands us to the
            # actual pluginfile stream after a 303.
            resp = session.get(url, timeout=30, allow_redirects=True)
            if resp.status_code != 200:
                skipped.append({"title": title, "reason": f"HTTP {resp.status_code}"})
                continue
            ctype = (resp.headers.get("content-type") or "").lower()
            if "pdf" not in ctype and not url.lower().endswith(".pdf"):
                # Probably a page wrapper or non-PDF. Skip.
                skipped.append({"title": title, "reason": "לא PDF"})
                continue
            pdf_bytes = resp.content
            if len(pdf_bytes) > _PDF_MAX_BYTES:
                skipped.append({
                    "title": title,
                    "reason": f"גדול מדי ({len(pdf_bytes)/1024/1024:.1f}MB)",
                })
                continue

            text, pages = _extract_pdf_text(pdf_bytes)
            if not text.strip():
                # Likely scanned. The client will show this so the user knows
                # to run OCR on their own machine if they want the text.
                skipped.append({"title": title, "reason": "PDF סרוק — יש להעלות ידנית עם OCR"})
                continue

            sources.append({
                "title": title.rsplit(".pdf", 1)[0],  # strip extension
                "content": text,
                "pages": pages,
                "url": url,
                "bytes": len(pdf_bytes),
                "section": c.get("section"),
            })
        except Exception as e:
            skipped.append({"title": title, "reason": str(e)[:120]})

    return {
        "status": "success",
        "sources": sources,
        "skipped": skipped,
        "total_candidates": len(candidates),
    }


def _get_moodle_user_id(session: requests.Session) -> int | None:
    """Extract the Moodle numeric user ID from the dashboard page."""
    try:
        resp = session.get(f"{MOODLE_URL}/my/", timeout=15)
        uid_match = re.search(r'data-userid="(\d+)"', resp.text)
        if not uid_match:
            uid_match = re.search(r'"userid"\s*:\s*(\d+)', resp.text)
        return int(uid_match.group(1)) if uid_match else None
    except Exception:
        return None


def scrape_grades() -> dict:
    """
    Fetch grades using multiple strategies:
      1. Moodle AJAX API (gradereport_overview_get_course_grades)
      2. Moodle HTML grade overview page (fallback)
      3. BGU Portal grade pages (historical grades)
    Returns all grades merged from all sources.
    """
    all_grades = []
    seen_courses = set()  # deduplicate by course name

    # ── Strategy 1: Moodle AJAX API ──────────────────────────────────────────
    cookies = _load_cookies_from_store("moodle")
    if cookies:
        session = _build_session(cookies)
        sesskey = _get_sesskey(session)
        moodle_uid = _get_moodle_user_id(session)

        if sesskey and moodle_uid:
            try:
                data = _moodle_ajax(session, sesskey, "gradereport_overview_get_course_grades", {
                    "userid": moodle_uid,
                })
                if data and "grades" in data:
                    for g in data["grades"]:
                        name = g.get("coursename", "").strip()
                        if name and name not in seen_courses:
                            seen_courses.add(name)
                            raw_grade = g.get("grade", "")
                            grade_num = None
                            if raw_grade:
                                try:
                                    grade_num = round(float(str(raw_grade).replace(",", ".")), 1)
                                except (ValueError, TypeError):
                                    pass
                            all_grades.append({
                                "course_moodle_id": str(g.get("courseid", "")),
                                "course_name": name,
                                "grade": grade_num,
                                "grade_text": str(raw_grade) if grade_num is None and raw_grade else None,
                                "rank": g.get("rank") or None,
                                "source": "moodle",
                            })
                    logger.debug(f"[BGU] AJAX grades: {len(all_grades)} courses")
            except Exception as e:
                logger.debug(f"[BGU] AJAX grade fetch failed: {e}")

        # ── Strategy 2: Moodle HTML grade overview page ────────────────────────
        if not all_grades:
            try:
                resp = session.get(
                    f"{MOODLE_URL}/grade/report/overview/index.php",
                    timeout=15,
                )
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    # Look for the overview grade table
                    table = soup.find("table", {"id": "overview-grade"}) or soup.find("table", class_=re.compile(r"generaltable|grade"))
                    if table:
                        rows = table.find_all("tr")
                        for row in rows[1:]:
                            cells = row.find_all(["td", "th"])
                            if len(cells) >= 2:
                                course_link = cells[0].find("a")
                                name = course_link.get_text(strip=True) if course_link else cells[0].get_text(strip=True)
                                grade_text = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                                if name and name not in seen_courses and grade_text and grade_text != "-":
                                    seen_courses.add(name)
                                    grade_num = None
                                    try:
                                        grade_num = round(float(grade_text.replace(",", ".")), 1)
                                    except (ValueError, TypeError):
                                        pass
                                    all_grades.append({
                                        "course_name": name,
                                        "grade": grade_num,
                                        "grade_text": grade_text if grade_num is None else None,
                                        "source": "moodle",
                                    })
                        logger.debug(f"[BGU] HTML grade page: {len(all_grades)} courses")
            except Exception as e:
                logger.debug(f"[BGU] HTML grade page failed: {e}")

    # ── Strategy 3: BGU Portal grade pages ───────────────────────────────────
    portal_cookies = _load_cookies_from_store("portal")
    if portal_cookies:
        try:
            portal_grades = _scrape_portal_grades(portal_cookies)
            for g in portal_grades:
                name = g.get("course_name", "").strip()
                key = f"{name}_{g.get('semester', '')}"
                if name and key not in seen_courses:
                    seen_courses.add(key)
                    all_grades.append(g)
            logger.debug(f"[BGU] Portal grades: {len(portal_grades)} found")
        except Exception as e:
            logger.debug(f"[BGU] Portal grade scraping failed: {e}")

    logger.debug(f"[BGU] Total grades from all sources: {len(all_grades)}")
    return {"status": "success", "grades": all_grades, "count": len(all_grades)}


def _scrape_portal_grades(cookies: list) -> list:
    """
    Try to scrape historical grades from the BGU portal (my.bgu.ac.il).
    Searches for grade-related pages and parses tables.
    """
    session = _build_session(cookies)
    grades = []

    # Try common BGU portal grade URLs (APEX-based + legacy PL/SQL)
    grade_paths = [
        "/apex/10g/r/f_kiosk1009/home",
        "/apex/10g/r/f_kiosk1009/grades",
        "/apex/10g/r/f_kiosk1009/transcript",
        "/pls/scwp/!scwp.grades",
        "/pls/scwp/!scwp.tziounim",
        "/pls/scwp/!scwp.student_grades",
        "/pls/scwp/!scwp.grades_report",
        "/pls/scwp/!scwp.student_record",
        "/pls/scwp/!scwp.gradebook",
    ]

    # First: try loading the main portal page and find links to grades
    try:
        main_resp = session.get(f"{PORTAL_URL}/apex/10g/r/f_kiosk1009/home", timeout=15)
        if main_resp.status_code == 200:
            main_soup = BeautifulSoup(main_resp.text, "html.parser")
            # Find links that contain grade-related keywords
            for a in main_soup.find_all("a", href=True):
                text = a.get_text(strip=True).lower()
                href = a["href"].lower()
                if any(kw in text or kw in href for kw in [
                    "ציונים", "ציון", "grades", "grade", "תעודה", "גיליון",
                    "record", "transcript", "tziounim",
                ]):
                    full_url = a["href"]
                    if not full_url.startswith("http"):
                        full_url = f"{PORTAL_URL}{a['href']}"
                    if full_url not in [f"{PORTAL_URL}{p}" for p in grade_paths]:
                        grade_paths.insert(0, a["href"])
                    logger.debug(f"[BGU] Found portal grade link: {a['href']} ({text})")
    except Exception as e:
        logger.debug(f"[BGU] Portal main page failed: {e}")

    # Try each grade path
    for path in grade_paths:
        try:
            url = path if path.startswith("http") else f"{PORTAL_URL}{path}"
            resp = session.get(url, timeout=15)
            if resp.status_code != 200 or len(resp.text) < 200:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            tables = soup.find_all("table")

            for table in tables:
                rows = table.find_all("tr")
                if len(rows) < 2:
                    continue

                # Try to find header row with grade-related columns
                header = rows[0]
                header_cells = [th.get_text(strip=True) for th in header.find_all(["th", "td"])]
                header_lower = [h.lower() for h in header_cells]

                # Look for columns: course name, grade, semester, credits
                name_idx = _find_col_idx(header_lower, ["קורס", "שם קורס", "course", "מקצוע", "שם המקצוע"])
                grade_idx = _find_col_idx(header_lower, ["ציון", "grade", "ציון סופי", "ציון מועד"])
                sem_idx = _find_col_idx(header_lower, ["סמסטר", "semester", "תקופה"])
                year_idx = _find_col_idx(header_lower, ["שנה", "year", "שנת לימודים", "שנה אקדמית"])
                credits_idx = _find_col_idx(header_lower, ["נקודות", "נק\"ז", "credits", "נ.ז.", "נקודות זכות"])

                if name_idx is None or grade_idx is None:
                    continue

                for row in rows[1:]:
                    cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                    if len(cells) <= max(name_idx, grade_idx):
                        continue

                    name = cells[name_idx].strip()
                    raw_grade = cells[grade_idx].strip()
                    if not name or not raw_grade or raw_grade == "-":
                        continue

                    grade_num = None
                    try:
                        grade_num = round(float(raw_grade.replace(",", ".")), 1)
                    except (ValueError, TypeError):
                        pass

                    g = {
                        "course_name": name,
                        "grade": grade_num,
                        "grade_text": raw_grade if grade_num is None else None,
                        "source": "portal",
                    }
                    if sem_idx is not None and sem_idx < len(cells):
                        g["semester"] = cells[sem_idx].strip()
                    if year_idx is not None and year_idx < len(cells):
                        g["academic_year"] = cells[year_idx].strip()
                    if credits_idx is not None and credits_idx < len(cells):
                        try:
                            g["credits"] = float(cells[credits_idx].strip().replace(",", "."))
                        except (ValueError, TypeError):
                            pass

                    grades.append(g)

                if grades:
                    logger.debug(f"[BGU] Portal: found {len(grades)} grades at {path}")
                    return grades  # Found grades, stop trying other paths

        except Exception as e:
            logger.debug(f"[BGU] Portal path {path} failed: {e}")
            continue

    return grades


def _find_col_idx(headers: list[str], keywords: list[str]) -> int | None:
    """Find the index of a column that contains any of the keywords."""
    for i, h in enumerate(headers):
        for kw in keywords:
            if kw in h:
                return i
    return None


def parse_portal_html(html: str, url: str = "", title: str = "") -> dict:
    """
    Parse raw HTML from the BGU portal (captured by Chrome extension)
    and extract grades + credits (נק"ז).
    Returns {status, grades: [...], grades_found: int}
    """
    soup = BeautifulSoup(html, "html.parser")
    grades = []
    seen = set()

    tables = soup.find_all("table")
    logger.debug(f"[BGU] parse_portal_html: found {len(tables)} tables in HTML ({len(html)} chars)")

    for table in tables:
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue

        # Try to find header row with grade-related columns
        header = rows[0]
        header_cells = [th.get_text(strip=True) for th in header.find_all(["th", "td"])]
        header_lower = [h.lower() for h in header_cells]

        # Look for columns: course name, grade, semester, credits, year, course ID
        name_idx = _find_col_idx(header_lower, ["קורס", "שם קורס", "course", "מקצוע", "שם המקצוע", "שם הקורס"])
        grade_idx = _find_col_idx(header_lower, ["ציון", "grade", "ציון סופי", "ציון מועד"])
        sem_idx = _find_col_idx(header_lower, ["סמסטר", "semester", "תקופה"])
        year_idx = _find_col_idx(header_lower, ["שנה", "year", "שנת לימודים", "שנה אקדמית"])
        credits_idx = _find_col_idx(header_lower, ["נקודות", 'נק"ז', "credits", "נ.ז.", "נקודות זכות", "נק״ז", "נקז"])
        course_id_idx = _find_col_idx(header_lower, ["מספר קורס", "מספר מקצוע", "course id", "קוד קורס", "מס' קורס"])

        if name_idx is None or grade_idx is None:
            # Try: maybe the table has no clear header — scan first row for numeric patterns
            # or skip this table
            continue

        logger.debug(f"[BGU] parse_portal_html: table has columns: name={name_idx} grade={grade_idx} "
                     f"credits={credits_idx} semester={sem_idx} year={year_idx}")

        for row in rows[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) <= max(name_idx, grade_idx):
                continue

            name = cells[name_idx].strip()
            raw_grade = cells[grade_idx].strip()
            if not name or not raw_grade or raw_grade == "-" or raw_grade == "":
                continue

            # Deduplicate by course name + semester
            semester = ""
            if sem_idx is not None and sem_idx < len(cells):
                semester = cells[sem_idx].strip()
            dedup_key = f"{name}_{semester}"
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            grade_num = None
            try:
                cleaned = raw_grade.replace(",", ".").strip()
                grade_num = round(float(cleaned), 1)
            except (ValueError, TypeError):
                pass

            g = {
                "course_name": name,
                "grade": grade_num,
                "grade_text": raw_grade if grade_num is None else None,
                "source": "portal",
            }
            if semester:
                g["semester"] = semester
            if year_idx is not None and year_idx < len(cells):
                g["academic_year"] = cells[year_idx].strip()
            if credits_idx is not None and credits_idx < len(cells):
                try:
                    cred_val = cells[credits_idx].strip().replace(",", ".")
                    if cred_val:
                        g["credits"] = float(cred_val)
                except (ValueError, TypeError):
                    pass
            if course_id_idx is not None and course_id_idx < len(cells):
                g["course_id"] = cells[course_id_idx].strip()

            grades.append(g)

    # If no tables with headers matched, try a broader scan for any table with numbers
    if not grades:
        for table in tables:
            rows = table.find_all("tr")
            if len(rows) < 3:
                continue
            # Check all rows for grade-like patterns (numbers 0-100)
            for row in rows:
                cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                # Look for rows with: text (course name), number (grade), possibly number (credits)
                if len(cells) >= 2:
                    for i, cell in enumerate(cells):
                        try:
                            val = float(cell.replace(",", "."))
                            if 0 <= val <= 100 and i > 0:
                                # Previous cell might be course name
                                name_cell = cells[i - 1].strip()
                                if name_cell and len(name_cell) > 2 and not name_cell.replace(".", "").replace(",", "").isdigit():
                                    dedup_key = f"{name_cell}_"
                                    if dedup_key not in seen:
                                        seen.add(dedup_key)
                                        g = {
                                            "course_name": name_cell,
                                            "grade": round(val, 1),
                                            "source": "portal",
                                        }
                                        # Check if next cell is credits (small number 0-10)
                                        if i + 1 < len(cells):
                                            try:
                                                cred = float(cells[i + 1].replace(",", "."))
                                                if 0 < cred <= 15:
                                                    g["credits"] = cred
                                            except (ValueError, TypeError):
                                                pass
                                        grades.append(g)
                                    break
                        except (ValueError, TypeError):
                            continue

    logger.debug(f"[BGU] parse_portal_html: extracted {len(grades)} grades total")
    return {
        "status": "success",
        "grades": grades,
        "grades_found": len(grades),
    }


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
