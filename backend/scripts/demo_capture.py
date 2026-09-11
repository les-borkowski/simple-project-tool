"""Seed the Quick Capture demo project and record replay fixtures for it.

Two steps, deliberately separate:

    uv run python -m scripts.demo_capture seed
    uv run python -m scripts.demo_capture record

`seed` is idempotent and touches only the demo project. `record` makes one real
LLM call per phrase in evals/fixtures/demo_script.json and writes a fixture keyed
exactly as ReplayClient will look it up — it goes through the same
build_project_context/extract path the API uses, so the prompt cannot drift.

Then demo offline with:

    LLM_PROVIDER=replay CAPTURE_REFERENCE_DATE=<reference_date from demo_script.json>
"""

import argparse
import asyncio
import json
import os
import secrets
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

from app.api.schemas.project import ProjectCreate
from app.api.services.capture_resolution_service import build_project_context
from app.api.services.capture_service import extract
from app.api.services.llm_credential_service import resolve_credential
from app.api.services.project_service import create_project
from app.auth.security import hash_password, verify_password
from app.core.config import settings
from app.core.llm.gemini_client import GeminiClient
from app.db.base import RoleEnum
from app.db.database import AsyncSessionLocal
from app.db.models import Project, ProjectMember, Story, User
from app.evals.run import DEFAULT_RESPONSES_DIR, _RecordingClient

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "evals" / "fixtures" / "demo_script.json"


def load_script() -> dict:
    return json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))


def resolve_seed_password() -> str:
    """The password for the seeded demo accounts.

    Never a literal: the member emails are committed in demo_script.json (the prompt
    embeds them), so a constant here would be a published login on every instance this
    script has ever been run against. Operators who want a known password set
    DEMO_SEED_PASSWORD; otherwise we mint a fresh one and print it once.
    """
    from_env = os.environ.get("DEMO_SEED_PASSWORD")
    if from_env:
        return from_env
    generated = secrets.token_urlsafe(24)
    print(f"generated demo account password (save it now, it is not stored): {generated}")
    return generated


def assert_seed_allowed(force: bool) -> None:
    """Refuse to create demo accounts on a non-DEBUG instance without an explicit opt-in."""
    if force or settings.DEBUG:
        return
    sys.exit(
        "Refusing to seed demo accounts: DEBUG is off, so this looks like a real "
        "deployment. These accounts are logins on whatever database DB_URL points at. "
        "Re-run with --force if that is genuinely what you want."
    )


async def _get_or_create_user(
    db, email: str, name: str, password: str, *, role: RoleEnum = RoleEnum.contributor
) -> User:
    """Create the account, or bring an already-seeded one back in line.

    Re-seeding is the only remediation an operator has for an instance seeded by an
    earlier version of this script, which used a password published in this repository.
    Returning an existing row untouched would make that remediation silently do nothing:
    the operator sees "already exists", assumes the credential rotated, and the old
    password still works. So an existing account has its password and role reset too.
    """
    user = (await db.scalars(select(User).where(User.email == email))).one_or_none()
    if user is not None:
        rotated = not verify_password(password, user.password_hash)
        user.password_hash = hash_password(password)
        user.role = role
        await db.flush()
        if rotated:
            print(f"  rotated password and reset role for existing account {email}")
        return user
    user = User(
        email=email,
        name=name,
        password_hash=hash_password(password),
        role=role,
        email_confirmed=True,
    )
    db.add(user)
    await db.flush()
    return user


async def seed(db, password: str | None = None) -> Project:
    """Create the demo project, its members, and its stories. Safe to re-run."""
    spec = load_script()["project"]
    members = spec["members"]
    password = password if password is not None else resolve_seed_password()

    # The owner is auto-added as a ProjectMember, so making the owner the first
    # listed member keeps the prompt's member list to exactly the names above.
    # create_project requires the global manager role, so the owner is created with it
    # and demoted immediately afterwards: resolve_role returns manager for a project's
    # owner regardless of global role, so the demo keeps every permission it needs
    # without leaving a standing global manager (which could create further projects
    # anywhere on the instance) behind.
    owner = await _get_or_create_user(
        db, members[0]["email"], members[0]["name"], password, role=RoleEnum.manager
    )

    project = (await db.scalars(select(Project).where(Project.name == spec["name"]))).one_or_none()
    if project is None:
        created = await create_project(ProjectCreate(name=spec["name"]), owner, db)
        project = await db.get(Project, created.id)
        print(f"created project {project.name!r} ({project.id})")
    else:
        print(f"project {project.name!r} already exists ({project.id})")

    owner.role = RoleEnum.contributor
    await db.flush()

    for entry in members[1:]:
        user = await _get_or_create_user(db, entry["email"], entry["name"], password)
        existing = (
            await db.scalars(
                select(ProjectMember).where(
                    ProjectMember.project_id == project.id,
                    ProjectMember.user_id == user.id,
                )
            )
        ).one_or_none()
        if existing is None:
            db.add(ProjectMember(project_id=project.id, user_id=user.id, role=RoleEnum.contributor))
            print(f"  added member {entry['name']}")

    for title in spec["stories"]:
        existing = (
            await db.scalars(
                select(Story).where(Story.project_id == project.id, Story.title == title)
            )
        ).one_or_none()
        if existing is None:
            db.add(
                Story(
                    project_id=project.id,
                    title=title,
                    status=project.status,
                    created_by=project.owner_id,
                )
            )
            print(f"  added story {title!r}")

    await db.commit()
    return project


async def _resolve_key(db, as_user: str | None) -> str:
    """Use the server key, or — only when named explicitly — one account's stored credential."""
    if settings.GOOGLE_API_KEY:
        return settings.GOOGLE_API_KEY
    if as_user is None:
        sys.exit(
            "No API key to record with. Either set GOOGLE_API_KEY in the environment, "
            "or pass --as-user <email> to borrow that account's stored credential."
        )
    user = (await db.scalars(select(User).where(User.email == as_user))).one_or_none()
    if user is None:
        sys.exit(f"No user with email {as_user!r}.")
    cred = await resolve_credential(user, db)
    if cred is None:
        sys.exit(f"{as_user} has no usable stored credential.")
    print(f"recording with {as_user}'s stored {cred.provider} credential")
    return cred.api_key


async def record(db, as_user: str | None) -> None:
    script = load_script()
    reference_date = date.fromisoformat(script["_meta"]["reference_date"])
    phrases = script["phrases"]

    project = await seed(db)
    owner = await db.get(User, project.owner_id)
    api_key = await _resolve_key(db, as_user)

    ctx, _, _ = await build_project_context(project.id, owner, db, reference_date)
    print(f"\ncontext: project={ctx.project_name!r}")
    print(f"         members={ctx.member_names}")
    print(f"         stories={ctx.story_names}")
    print(f"         reference_date={ctx.reference_date}\n")

    recorder = _RecordingClient(GeminiClient(), DEFAULT_RESPONSES_DIR)
    written: set[str] = set()

    for i, text in enumerate(phrases, 1):
        print(f"[{i}/{len(phrases)}] {text[:70]}...")
        outcome = await extract(text, ctx, recorder, api_key=api_key)
        state = "unparseable" if outcome.unparseable else f"{len(outcome.result.tasks)} task(s)"
        print(f"          -> {state}")
        await asyncio.sleep(1)  # free-tier friendly

    recorder.flush(written)
    print(f"\nwrote {len(written)} fixture(s) to {DEFAULT_RESPONSES_DIR}")
    print(
        "\nDemo offline with:\n"
        f"  LLM_PROVIDER=replay CAPTURE_REFERENCE_DATE={reference_date.isoformat()} "
        "uv run python -m app.main"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("seed", "record"))
    parser.add_argument(
        "--as-user",
        help="Email of an account whose stored credential to record with, "
        "when GOOGLE_API_KEY is not set.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Seed even when DEBUG is off. These accounts are real logins on the "
        "database DB_URL points at — only pass this if you mean it.",
    )
    return parser


async def main() -> None:
    args = build_parser().parse_args()

    assert_seed_allowed(args.force)

    async with AsyncSessionLocal() as db:
        if args.command == "seed":
            await seed(db)
        else:
            await record(db, args.as_user)


if __name__ == "__main__":
    asyncio.run(main())
