"""Registry mapping university code -> selectors dict.

The active university is read from the UNIVERSITY env var (defaults to
'bgu' to preserve the original deployment's behaviour). Per-call
override via `get_selectors(code)` is also supported so a multi-tenant
flow can pick the right config without restarting the process.
"""
import os

from services.bgu_selectors import BGU_SELECTORS
from services.tau_selectors import TAU_SELECTORS

_REGISTRY: dict[str, dict] = {
    "bgu": BGU_SELECTORS,
    "tau": TAU_SELECTORS,
}


def get_selectors(code: str | None = None) -> dict:
    """Return the selectors dict for `code`, falling back to UNIVERSITY env
    var, then to BGU. Lookup is case-insensitive.
    """
    key = (code or os.getenv("UNIVERSITY") or "bgu").strip().lower()
    return _REGISTRY.get(key) or _REGISTRY["bgu"]


def active_code() -> str:
    """Return the currently active university code (env-driven default)."""
    return get_selectors()["code"]
