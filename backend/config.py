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
logger = logging.getLogger("bgu-study")

# ── Core credentials ──────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-in-production")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

# Optional: pre-set BGU credentials so no login form is needed
BGU_USERNAME = os.getenv("BGU_USERNAME", "")
BGU_PASSWORD = os.getenv("BGU_PASSWORD", "")

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
