"""
services/supabase_client — basic resilience.

The client module is what every route grabs the DB through. If it crashes
on import (missing env, etc.) every route returns 500. This test covers the
"happy path import" so a regression in module-level code is caught.
"""


class TestSupabaseClient:
    def test_module_imports_without_real_credentials(self):
        """Conftest sets dummy env vars before any test runs. Importing the
        module should not raise — get_client() may fail later, but module
        load must succeed (otherwise the whole app fails to boot)."""
        from services import supabase_client  # noqa: F401

    def test_get_client_returns_something(self, supabase_mock):
        """With supabase_mock fixture installed, get_client returns the
        mock instead of a real Supabase connection."""
        from services import supabase_client
        client = supabase_client.get_client()
        assert client is not None
        # The mock fixture configured a chain — confirm the same chainable
        # API the routes rely on.
        result = client.table("courses").select("*").limit(1).execute()
        assert result.data == []
