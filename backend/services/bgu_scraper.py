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
from config import logger

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
                    courses.append({
                        "title": course.get("fullname", ""),
                        "url": course.get("viewurl", ""),
                        "moodle_id": str(course.get("id", "")),
                        "summary": course.get("summary", ""),
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


def scrape_grades() -> dict:
    """Fetch grades for all courses via Moodle AJAX API."""
    cookies = _load_cookies_from_store("moodle")
    if not cookies:
        return {"status": "error", "message": "לא מחובר ל-Moodle."}

    session = _build_session(cookies)
    sesskey = _get_sesskey(session)

    if not sesskey:
        return {"status": "error", "message": "לא ניתן לשלוף sesskey."}

    # Get user ID from Moodle
    try:
        resp = session.get(f"{MOODLE_URL}/my/", timeout=15)
        uid_match = re.search(r'data-userid="(\d+)"', resp.text)
        if not uid_match:
            uid_match = re.search(r'"userid"\s*:\s*(\d+)', resp.text)
        if not uid_match:
            return {"status": "error", "message": "לא ניתן לזהות משתמש Moodle."}
        moodle_user_id = int(uid_match.group(1))
    except Exception as e:
        return {"status": "error", "message": f"שגיאה בזיהוי משתמש: {e}"}

    # Get enrolled courses first
    courses_result = scrape_moodle_courses()
    if not courses_result.get("courses"):
        return {"status": "error", "message": "לא נמצאו קורסים."}

    grades = []
    for course in courses_result["courses"]:
        cid = course.get("moodle_id")
        if not cid or not cid.isdigit():
            continue
        try:
            data = _moodle_ajax(session, sesskey, "gradereport_overview_get_course_grades", {
                "userid": moodle_user_id,
            })
            if data and "grades" in data:
                for g in data["grades"]:
                    grades.append({
                        "course_id": str(g.get("courseid", "")),
                        "course_name": g.get("coursename", course.get("title", "")),
                        "grade": g.get("grade", ""),
                        "rank": g.get("rank", ""),
                    })
                break  # This API returns all courses at once
        except Exception as e:
            logger.debug(f"[BGU] Grade fetch failed for course {cid}: {e}")

    return {"status": "success", "grades": grades, "count": len(grades)}


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
