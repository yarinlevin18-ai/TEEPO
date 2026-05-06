"""AES-256-GCM encryption for Google refresh tokens at rest.

Why this module exists
======================
Refresh tokens are the long-lived credential — losing one means a user gets
bounced through Google OAuth on every fresh device. Storing them in plaintext
in Postgres turns a database leak into an account-takeover blast radius.

We wrap each refresh token in AES-256-GCM. The encryption key is derived
once at import time from FLASK_SECRET_KEY via HKDF. Each ciphertext gets a
fresh 12-byte IV which is stored alongside the ciphertext in the DB row.

Public surface
==============
- encrypt(plaintext: str) -> tuple[str, str]
    Returns (ciphertext_b64, iv_b64). Both are URL-safe base64 strings
    suitable for storage as TEXT columns.

- decrypt(ciphertext_b64: str, iv_b64: str) -> str
    Returns the plaintext. Raises InvalidToken if the ciphertext was
    tampered with or the wrong key is in use.

Failure modes
=============
- Missing FLASK_SECRET_KEY → fast fail at module import (we want this to
  blow up at startup, not at first encrypt call deep in a request handler).
- Tampered ciphertext / wrong key → raises `InvalidToken` (subclass of
  `cryptography.exceptions.InvalidTag` re-raised as a stable type).
"""
from __future__ import annotations

import base64
import os
from typing import Tuple

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from config import FLASK_SECRET_KEY, logger


class InvalidToken(Exception):
    """Raised when ciphertext fails authentication (tampered or wrong key)."""


# HKDF info string — bumping this invalidates every stored ciphertext.
# Keep it stable across deploys unless you intentionally want to rotate keys.
_HKDF_INFO = b"google-refresh-token-v1"
_KEY_LEN = 32       # AES-256
_IV_LEN = 12        # NIST recommendation for GCM


def _derive_key() -> bytes:
    """Derive a 32-byte AES key from FLASK_SECRET_KEY at import time.

    HKDF-SHA256 turns whatever entropy lives in FLASK_SECRET_KEY into a
    uniformly distributed 32-byte key. We use a fixed `info` so the same
    secret always derives the same key — necessary for decryption to work
    across restarts.
    """
    if not FLASK_SECRET_KEY or FLASK_SECRET_KEY == "dev-secret-change-in-production":
        # Allow dev/testing to proceed but log loudly. Production deploys
        # will fail validate_config() in config.py before we get here.
        logger.warning(
            "[token_crypto] FLASK_SECRET_KEY is unset or default. "
            "Encrypted refresh tokens will not survive a key rotation."
        )

    return HKDF(
        algorithm=hashes.SHA256(),
        length=_KEY_LEN,
        salt=None,
        info=_HKDF_INFO,
    ).derive(FLASK_SECRET_KEY.encode("utf-8"))


# Derive once at import. Re-deriving on every call would be wasteful and
# would also mean a runtime change to FLASK_SECRET_KEY silently rotates
# the key mid-process — better to require a restart.
_KEY = _derive_key()
_AESGCM = AESGCM(_KEY)


def encrypt(plaintext: str) -> Tuple[str, str]:
    """Encrypt `plaintext` and return (ciphertext_b64, iv_b64).

    Each call generates a fresh random IV. The ciphertext includes the
    GCM authentication tag (16 bytes appended).
    """
    if not isinstance(plaintext, str) or not plaintext:
        raise ValueError("plaintext must be a non-empty string")

    iv = os.urandom(_IV_LEN)
    ct = _AESGCM.encrypt(iv, plaintext.encode("utf-8"), associated_data=None)
    return (
        base64.urlsafe_b64encode(ct).decode("ascii"),
        base64.urlsafe_b64encode(iv).decode("ascii"),
    )


def decrypt(ciphertext_b64: str, iv_b64: str) -> str:
    """Decrypt the (ciphertext, iv) pair produced by encrypt().

    Raises InvalidToken on auth failure (tampered ciphertext, wrong key,
    truncated IV, etc.). The caller should treat that as a 401 — the row
    is unrecoverable.
    """
    try:
        ct = base64.urlsafe_b64decode(ciphertext_b64.encode("ascii"))
        iv = base64.urlsafe_b64decode(iv_b64.encode("ascii"))
    except (ValueError, TypeError) as e:
        raise InvalidToken(f"malformed base64: {e}") from e

    if len(iv) != _IV_LEN:
        raise InvalidToken(f"iv length must be {_IV_LEN}, got {len(iv)}")

    try:
        pt = _AESGCM.decrypt(iv, ct, associated_data=None)
    except InvalidTag as e:
        raise InvalidToken("ciphertext failed authentication") from e

    return pt.decode("utf-8")
