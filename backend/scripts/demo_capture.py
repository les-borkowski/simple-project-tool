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
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

from app.api.schemas.project import ProjectCreate
from app.api.services.capture_resolution_service import build_project_context
from app.api.services.capture_service import extract
from app.api.services.llm_credential_service import resolve_credential
from app.api.services.project_service import create_project
from app.auth.security import hash_password
from app.core.config import settings
from app.core.llm.gemini_client import GeminiClient
from app.db.base import RoleEnum
from app.db.database import AsyncSessionLocal
from app.db.models import Project, ProjectMember, Story, User
from app.evals.run import DEFAULT_RESPONSES_DIR, _RecordingClient

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "evals" / "fixtures" / "demo_script.json"
DEMO_PASSWORD = "demo-capture-seed"


def load_script() -> dict:
    return json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))


async def _get_or_create_user(db, email: str, name: str) -> User:
    user = (await db.scalars(select(User).where(User.email == email))).one_or_none()
    if user is not None:
        return user
    user = User(
        email=email,
        name=name,
        password_hash=hash_password(DEMO_PASSWORD),
        role=RoleEnum.manager,
        email_confirmed=True,
    )
    db.add(user)
    await db.flush()
    return user


async def seed(db) -> Project:
    """Create the demo project, its members, and its stories. Safe to re-run."""
    spec = load_script()["project"]
    members = spec["members"]

    # The owner is auto-added as a ProjectMember, so making the owner the first
    # listed member keeps the prompt's member list to exactly the names above.
    owner = await _get_or_create_user(db, members[0]["email"], members[0]["name"])

    project = (await db.scalars(select(Project).where(Project.name == spec["name"]))).one_or_none()
    if project is None:
        created = await create_project(ProjectCreate(name=spec["name"]), owner, db)
        project = await db.get(Project, created.id)
        print(f"created project {project.name!r} ({project.id})")
    else:
        print(f"project {project.name!r} already exists ({project.id})")

    for entry in members[1:]:
        user = await _get_or_create_user(db, entry["email"], entry["name"])
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


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("seed", "record"))
    parser.add_argument(
        "--as-user",
        help="Email of an account whose stored credential to record with, "
        "when GOOGLE_API_KEY is not set.",
    )
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        if args.command == "seed":
            await seed(db)
        else:
            await record(db, args.as_user)


if __name__ == "__main__":
    asyncio.run(main())
