"""
Shared pytest fixtures.

Every test gets a Flask test client with all external services
(Supabase, Anthropic, Selenium-driven scrapers) stubbed out by default —
real network is forbidden in unit tests. Specific tests can override a
mock to exercise a particular failure path.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# The backend code uses bare imports (`from config import ...`,
# `from routes.api import ...`). Make those importable from the
# backend/ root regardless of where pytest is invoked from.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


# ────────────────────────────────────────────────────────────────────────
# Env defaults — set BEFORE importing the app so config.py reads them
# ────────────────────────────────────────────────────────────────────────
os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("FLASK_SECRET_KEY", "test-secret")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
# Don't set GOOGLE_* — leaving them missing exercises the "server not
# configured" branch of the auth route, which is what we want to test.


@pytest.fixture
def supabase_mock(mocker):
    """Mock the supabase_client module everywhere it's imported.

    Returns the mock client so tests can configure responses:
        supabase_mock.table.return_value.select.return_value.execute.return_value.data = [...]
    """
    client = MagicMock()
    # Make the chainable `.table().select().limit().execute()` return data
    # by default — empty rows, no error.
    chain = client.table.return_value
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value.data = []

    # auth.get_user used by /api/_user_id() — default to no user
    client.auth.get_user.return_value = MagicMock(user=None)

    mocker.patch("services.supabase_client.get_client", return_value=client)
    return client


@pytest.fixture
def anthropic_mock(mocker):
    """Mock the Anthropic client. Default response is a generic success."""
    client = MagicMock()
    response = MagicMock()
    response.content = [MagicMock(text='{"summary": "test", "tasks": []}')]
    client.messages.create.return_value = response
    mocker.patch("anthropic.Anthropic", return_value=client)
    return client


@pytest.fixture
def app(supabase_mock, anthropic_mock):
    """Flask app instance with services stubbed out."""
    # Import here, AFTER env vars are set + mocks installed, so the app
    # picks up the test-friendly config.
    from app import app as _app
    _app.config["TESTING"] = True
    return _app


@pytest.fixture
def client(app):
    """Flask test client. Use this to make in-process HTTP calls."""
    return app.test_client()
