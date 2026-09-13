from dataclasses import replace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException


def test_get_provider_google_available():
    from app.core.llm.providers import get_provider

    spec = get_provider("google")
    assert spec.available is True
    assert spec.id == "google"


def test_get_provider_anthropic_declared_but_unavailable():
    from app.core.llm.providers import get_provider

    spec = get_provider("anthropic")
    assert spec.available is False
    assert spec.id == "anthropic"


def test_get_provider_unknown_raises_422_unknown_provider():
    from app.core.llm.providers import get_provider

    with pytest.raises(HTTPException) as excinfo:
        get_provider("bogus")

    assert excinfo.value.status_code == 422
    assert excinfo.value.detail == "UNKNOWN_PROVIDER"


def test_available_providers_excludes_unavailable():
    from app.core.llm.providers import available_providers

    ids = {spec.id for spec in available_providers()}
    assert "google" in ids
    assert "anthropic" not in ids
    assert "openai" not in ids


def test_get_llm_client_for_unavailable_provider_raises_named():
    from app.core.llm import get_llm_client_for

    with pytest.raises(ValueError, match="anthropic"):
        get_llm_client_for("anthropic")


def test_get_llm_client_for_unknown_provider_raises_named():
    from app.core.llm import get_llm_client_for

    with pytest.raises(ValueError, match="bogus"):
        get_llm_client_for("bogus")


def test_unknown_provider_id_message_distinguishes_from_not_yet_available():
    from app.core.llm import get_llm_client_for

    with pytest.raises(ValueError, match="unknown") as excinfo:
        get_llm_client_for("bogus")

    assert "not yet available" not in str(excinfo.value)


def test_get_llm_client_for_google_returns_client():
    from app.core.llm import get_llm_client_for
    from app.core.llm.gemini_client import GeminiClient

    assert isinstance(get_llm_client_for("google"), GeminiClient)


def test_get_llm_client_unknown_provider_names_env_var():
    import app.core.llm as llm_pkg

    with patch.object(llm_pkg, "settings", MagicMock(LLM_PROVIDER="bogus")):
        with pytest.raises(ValueError, match="unknown LLM_PROVIDER"):
            llm_pkg.get_llm_client()


def test_declared_available_but_no_adapter_is_a_wiring_bug_not_unavailable():
    """A provider marked available=True with no matching _ADAPTERS entry is a
    misconfiguration, not an expected "not implemented" case — must not be
    reported the same way as anthropic/openai."""
    import app.core.llm as llm_pkg
    from app.core.llm.providers import PROVIDERS

    fake_spec = replace(PROVIDERS["anthropic"], id="fake", available=True)
    patched_providers = {**PROVIDERS, "fake": fake_spec}

    with patch.object(llm_pkg, "PROVIDERS", patched_providers):
        with pytest.raises(ValueError, match="wiring bug") as excinfo:
            llm_pkg.get_llm_client_for("fake")

    assert "not yet available" not in str(excinfo.value)
