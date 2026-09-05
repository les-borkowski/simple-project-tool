from app.core.config import settings
from app.db.models.user import User
from app.db.models.user_llm_provider import (
    UserLLMProvider,
    effective_rpm_limit,
    effective_tpm_limit,
)


def _user(llm_rpm_ceiling=None, llm_tpm_ceiling=None) -> User:
    return User(llm_rpm_ceiling=llm_rpm_ceiling, llm_tpm_ceiling=llm_tpm_ceiling)


def test_no_row_falls_back_to_ceiling():
    user = _user()

    assert effective_rpm_limit(None, user) == settings.LLM_MAX_RPM
    assert effective_tpm_limit(None, user) == settings.LLM_MAX_TPM


def test_row_with_no_limit_set_falls_back_to_ceiling():
    user = _user()
    row = UserLLMProvider(rpm_limit=None, tpm_limit=None)

    assert effective_rpm_limit(row, user) == settings.LLM_MAX_RPM
    assert effective_tpm_limit(row, user) == settings.LLM_MAX_TPM


def test_user_limit_below_ceiling_wins():
    user = _user()
    row = UserLLMProvider(rpm_limit=5, tpm_limit=1_000)

    assert effective_rpm_limit(row, user) == 5
    assert effective_tpm_limit(row, user) == 1_000


def test_user_limit_above_ceiling_clamps():
    user = _user()
    row = UserLLMProvider(
        rpm_limit=settings.LLM_MAX_RPM + 100, tpm_limit=settings.LLM_MAX_TPM + 100
    )

    assert effective_rpm_limit(row, user) == settings.LLM_MAX_RPM
    assert effective_tpm_limit(row, user) == settings.LLM_MAX_TPM


def test_admin_ceiling_overrides_server_default():
    user = _user(llm_rpm_ceiling=3, llm_tpm_ceiling=500)

    assert effective_rpm_limit(None, user) == 3
    assert effective_tpm_limit(None, user) == 500


def test_admin_ceiling_still_clamps_user_limit():
    user = _user(llm_rpm_ceiling=3, llm_tpm_ceiling=500)
    row = UserLLMProvider(rpm_limit=10, tpm_limit=1_000)

    assert effective_rpm_limit(row, user) == 3
    assert effective_tpm_limit(row, user) == 500


def test_zero_ceiling_is_honored_not_treated_as_unset():
    # 0 is a validly-set ceiling (e.g. admin fully throttling a user) — must not be
    # confused with None ("no ceiling set, use server default") via truthiness.
    user = _user(llm_rpm_ceiling=0, llm_tpm_ceiling=0)

    assert effective_rpm_limit(None, user) == 0
    assert effective_tpm_limit(None, user) == 0
