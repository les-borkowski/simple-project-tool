"""Guards on the demo seed script's credentials.

`scripts.demo_capture seed` is documented in README as the way to stand up the
offline capture demo, so it gets run against deployed instances. That makes the
accounts it creates a production attack surface: a password baked into a public
repo is an unauthenticated login for anyone who reads it.
"""

from pathlib import Path

import pytest
from sqlalchemy import select

import scripts.demo_capture as demo_capture

SCRIPT_SOURCE = Path(demo_capture.__file__).read_text(encoding="utf-8")


@pytest.fixture(autouse=True)
def _no_ambient_seed_password(monkeypatch):
    """resolve_seed_password reads os.environ directly, so a developer or CI runner with
    DEMO_SEED_PASSWORD exported would otherwise flip the generated-password tests."""
    monkeypatch.delenv("DEMO_SEED_PASSWORD", raising=False)


class TestSeedPasswordIsNotBakedIn:
    def test_module_defines_no_literal_password(self):
        # A module-level string constant is what gets read out of the public repo.
        assert not hasattr(demo_capture, "DEMO_PASSWORD"), (
            "demo_capture must not ship a hardcoded seed password; read it from "
            "DEMO_SEED_PASSWORD or generate one per run"
        )

    def test_source_has_no_password_literal(self):
        # Catches the constant being inlined at the call site instead.
        assert "demo-capture-seed" not in SCRIPT_SOURCE

    def test_generated_password_is_unpredictable(self):
        first = demo_capture.resolve_seed_password()
        second = demo_capture.resolve_seed_password()

        assert first != second, "an unset DEMO_SEED_PASSWORD must generate a fresh password"
        assert len(first) >= 16

    def test_env_password_is_honoured(self, monkeypatch):
        monkeypatch.setenv("DEMO_SEED_PASSWORD", "operator-chosen-password")

        assert demo_capture.resolve_seed_password() == "operator-chosen-password"

    def test_generated_password_is_printed_so_the_operator_can_log_in(self, capsys):
        password = demo_capture.resolve_seed_password()

        printed = capsys.readouterr().out
        assert password in printed, "a generated password is useless if it is never shown"

    def test_env_password_is_not_printed(self, monkeypatch, capsys):
        monkeypatch.setenv("DEMO_SEED_PASSWORD", "operator-chosen-password")

        demo_capture.resolve_seed_password()

        assert "operator-chosen-password" not in capsys.readouterr().out


class TestNoSeededAccountKeepsGlobalManager:
    """Asserted against a real seeded database, not against the script's source text.

    A grep for "RoleEnum.manager" would be both weaker (it never shows what a seeded
    user's role actually *is*) and brittle — the script legitimately needs the manager
    role momentarily, because create_project requires it.
    """

    async def test_no_seeded_member_is_left_a_global_manager(self, api_db, monkeypatch):
        from app.db.base import RoleEnum
        from app.db.models import User

        monkeypatch.setenv("DEMO_SEED_PASSWORD", "whatever")
        await demo_capture.seed(api_db)

        emails = [m["email"] for m in demo_capture.load_script()["project"]["members"]]
        users = (await api_db.scalars(select(User).where(User.email.in_(emails)))).all()

        assert len(users) == len(emails), "not every scripted member was seeded"
        for user in users:
            assert user.role is RoleEnum.contributor, (
                f"{user.email} was left with the global {user.role} role"
            )

    async def test_the_owner_still_manages_its_own_project(self, api_db, monkeypatch):
        """Demoting the owner must not cost the demo any permission it needs."""
        from app.auth.permissions import resolve_role
        from app.db.base import RoleEnum
        from app.db.models import User

        monkeypatch.setenv("DEMO_SEED_PASSWORD", "whatever")
        project = await demo_capture.seed(api_db)

        owner = await api_db.get(User, project.owner_id)
        assert await resolve_role(owner, project.id, api_db) is RoleEnum.manager


class TestSeedRefusesToRunUnguardedInProduction:
    def test_seed_aborts_when_debug_is_off(self, monkeypatch):
        monkeypatch.setattr(demo_capture.settings, "DEBUG", False)

        with pytest.raises(SystemExit):
            demo_capture.assert_seed_allowed(force=False)

    def test_seed_allowed_when_debug_is_on(self, monkeypatch):
        monkeypatch.setattr(demo_capture.settings, "DEBUG", True)

        demo_capture.assert_seed_allowed(force=False)

    def test_explicit_force_overrides_the_guard(self, monkeypatch):
        monkeypatch.setattr(demo_capture.settings, "DEBUG", False)

        demo_capture.assert_seed_allowed(force=True)


class TestReseedingRotatesAnAlreadySeededAccount:
    """Re-running seed is the only remediation an operator has for the published password.

    If it silently leaves an existing account alone, an operator who reads the warning,
    re-seeds with a new password and sees "project already exists" will believe they
    have rotated a credential that in fact still accepts `demo-capture-seed`.
    """

    async def test_existing_account_gets_the_new_password(self, api_db, monkeypatch):
        from app.auth.security import hash_password, verify_password
        from app.db.base import RoleEnum
        from app.db.models import User

        script = demo_capture.load_script()
        email = script["project"]["members"][0]["email"]

        api_db.add(
            User(
                email=email,
                name="Previously Seeded",
                password_hash=hash_password("demo-capture-seed"),
                role=RoleEnum.manager,
                email_confirmed=True,
            )
        )
        await api_db.flush()

        monkeypatch.setenv("DEMO_SEED_PASSWORD", "rotated-password")
        await demo_capture.seed(api_db)

        user = (await api_db.scalars(select(User).where(User.email == email))).one()
        assert not verify_password("demo-capture-seed", user.password_hash), (
            "the published password still authenticates after a re-seed"
        )
        assert verify_password("rotated-password", user.password_hash)

    async def test_existing_global_manager_is_demoted(self, api_db, monkeypatch):
        from app.auth.security import hash_password
        from app.db.base import RoleEnum
        from app.db.models import User

        script = demo_capture.load_script()
        email = script["project"]["members"][0]["email"]

        api_db.add(
            User(
                email=email,
                name="Previously Seeded",
                password_hash=hash_password("demo-capture-seed"),
                role=RoleEnum.manager,
                email_confirmed=True,
            )
        )
        await api_db.flush()

        monkeypatch.setenv("DEMO_SEED_PASSWORD", "rotated-password")
        await demo_capture.seed(api_db)

        user = (await api_db.scalars(select(User).where(User.email == email))).one()
        assert user.role is RoleEnum.contributor


class TestSeededAccountsHaveTheRightRole:
    async def test_a_freshly_seeded_user_is_a_contributor(self, api_db, monkeypatch):
        from app.db.base import RoleEnum
        from app.db.models import User

        monkeypatch.setenv("DEMO_SEED_PASSWORD", "whatever")
        project = await demo_capture.seed(api_db)

        owner = await api_db.get(User, project.owner_id)
        assert owner.role is RoleEnum.contributor


class TestForceFlagIsReachableFromTheCommandLine:
    def test_seed_defaults_to_guarded(self):
        args = demo_capture.build_parser().parse_args(["seed"])

        assert args.force is False

    def test_force_flag_parses(self):
        args = demo_capture.build_parser().parse_args(["seed", "--force"])

        assert args.force is True
