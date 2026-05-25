import os
import logging
from dotenv import load_dotenv

load_dotenv()

# ── Logging ────────────────────────────────────────────────────────────
FLASK_ENV = os.getenv("FLASK_ENV", "development")
IS_PRODUCTION = FLASK_ENV == "production" or os.getenv("RENDER", "")

logging.basicConfig(
    level=logging.INFO if IS_PRODUCTION else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("teepo")

# ── Core credentials ──────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-in-production")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

# ── University / Moodle integration ───────────────────────────────────
# URLs for the university LMS. Set per deploy so the platform can serve
# students from any school. Moodle is supported out of the box; Portal is
# an optional integration (originally for BGU's bgu4u22/my.bgu.ac.il).
MOODLE_URL = os.getenv("MOODLE_URL", "")
PORTAL_URL = os.getenv("PORTAL_URL", "")
PORTAL_URL_OLD = os.getenv("PORTAL_URL_OLD", "")

# Comma-separated SSRF allowlist. If unset we derive it from MOODLE_URL /
# PORTAL_URL / PORTAL_URL_OLD hostnames.
UNIVERSITY_ALLOWED_DOMAINS = os.getenv("UNIVERSITY_ALLOWED_DOMAINS", "")

# Optional: pre-set credentials so no login form is needed.
# Legacy BGU_USERNAME / BGU_PASSWORD env vars are still read as a fallback so
# existing deploys keep working without rotation.
UNIVERSITY_USERNAME = os.getenv("UNIVERSITY_USERNAME") or os.getenv("BGU_USERNAME", "")
UNIVERSITY_PASSWORD = os.getenv("UNIVERSITY_PASSWORD") or os.getenv("BGU_PASSWORD", "")

# Human-readable university name for prompts / logs. User-facing UI uses
# NEXT_PUBLIC_UNIVERSITY_NAME on the frontend.
UNIVERSITY_NAME = os.getenv("UNIVERSITY_NAME", "")

# Optional path to a university-info JSON file (deans, faculties, calendar,
# etc.) used by the academic advisor. Empty = advisor runs without school-
# specific context.
UNIVERSITY_INFO_PATH = os.getenv("UNIVERSITY_INFO_PATH", "")

# Google OAuth (used for refreshing the provider access_token that Supabase
# surfaces once but never rotates — needed for Drive + Calendar persistence)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# Path to the existing orchestrator agents (empty = use direct Claude calls)
ORCHESTRATOR_PATH = os.getenv("ORCHESTRATOR_PATH", "")

# ── Startup validation ────────────────────────────────────────────────
def validate_config():
    """Log warnings for missing credentials on startup."""
    missing = []
    if not ANTHROPIC_API_KEY:
        missing.append("ANTHROPIC_API_KEY")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")

    if missing:
        logger.warning(f"Missing env vars: {', '.join(missing)}")
        logger.warning("Some features will not work without these credentials.")
    else:
        logger.info("All core credentials loaded successfully.")

    if IS_PRODUCTION and FLASK_SECRET_KEY == "dev-secret-change-in-production":
        logger.error("FLASK_SECRET_KEY is using the default value in production!")

    if ORCHESTRATOR_PATH and not os.path.exists(ORCHESTRATOR_PATH):
        logger.warning(
            f"Orchestrator path not found: {ORCHESTRATOR_PATH}. "
            "Falling back to direct Claude API calls."
        )

validate_config()
