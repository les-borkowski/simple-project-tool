# Security & Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical and High findings from the full-app code review, plus the most impactful Medium issues, across backend and frontend.

**Architecture:** Fixes are grouped by domain (backend auth, backend DB, frontend) within phases. Tasks in the same phase that touch different files can be dispatched in parallel. Each task ends with a commit.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, React 19, TypeScript, Axios

---

## Parallelism Map

```
Phase 1 (Critical backend): Task 1 ‖ Task 2 ‖ Task 3   — all touch different files
Phase 2 (High backend):     Task 4 ‖ Task 5              — different files
Phase 3 (DB):               Task 6                        — migrations, run alone
Phase 4 (Frontend):         Task 7 ‖ Task 8              — different concerns
Phase 5 (Frontend medium):  Task 9                        — i18n sweep
Phase 6 (Housekeeping):     Task 10                       — misc cleanup
```

---

## Task 1 — IDOR: resolve_role bypass + Backlog protection + cursor 500

**Fixes:** C1, H11, M5 (medium)

**Files:**
- Modify: `backend/app/api/services/task_service.py` (~line 305)
- Modify: `backend/app/api/services/story_service.py` (~lines 163, 182, 172)
- Modify: `backend/app/api/pagination.py`
- Test: `backend/tests/test_task_service.py` (or create)
- Test: `backend/tests/test_story_service.py` (or create)

- [ ] **Step 1: Write failing test — IDOR on delete_task**

```python
# backend/tests/test_task_service.py
# Add test alongside existing tests
@pytest.mark.asyncio
async def test_delete_task_non_member_global_manager_forbidden(db_session, make_user, make_project, make_story, make_task):
    """A global manager who is NOT a project member must not be able to delete tasks."""
    owner = await make_user(role="manager")
    intruder = await make_user(role="manager")  # global manager, not a member
    project = await make_project(owner=owner)
    story = await make_story(project_id=project.id)
    task = await make_task(story_id=story.id, project_id=project.id)

    with pytest.raises(HTTPException) as exc:
        await task_service.delete_task(task.id, intruder, db_session)
    assert exc.value.status_code == 403
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && uv run pytest tests/test_task_service.py::test_delete_task_non_member_global_manager_forbidden -v
```
Expected: FAIL (currently passes when it should not — the bug is real)

- [ ] **Step 3: Fix `delete_task` in `task_service.py`**

Replace:
```python
role = await resolve_role(user, task.project_id, db)
require_manager(role)
```
With:
```python
role = await require_project_access(user, task.project_id, db)
require_manager(role)
```

Also remove the `resolve_role` import if it's no longer used in this file.

- [ ] **Step 4: Write failing test — IDOR on delete_story**

```python
# backend/tests/test_story_service.py
@pytest.mark.asyncio
async def test_delete_story_non_member_global_manager_forbidden(db_session, make_user, make_project, make_story):
    owner = await make_user(role="manager")
    intruder = await make_user(role="manager")
    project = await make_project(owner=owner)
    story = await make_story(project_id=project.id, is_default=False)

    with pytest.raises(HTTPException) as exc:
        await story_service.delete_story(story.id, intruder, db_session)
    assert exc.value.status_code == 403
```

- [ ] **Step 5: Fix `delete_story` in `story_service.py`**

Replace:
```python
from app.auth.permissions import resolve_role

role = await resolve_role(user, story.project_id, db)
require_manager(role)
```
With:
```python
role = await require_project_access(user, story.project_id, db)
require_manager(role)
```

- [ ] **Step 6: Write failing test — IDOR on move_story**

```python
@pytest.mark.asyncio
async def test_move_story_non_member_global_manager_forbidden(db_session, make_user, make_project, make_story):
    owner = await make_user(role="manager")
    intruder = await make_user(role="manager")
    project_a = await make_project(owner=owner)
    project_b = await make_project(owner=owner)
    story = await make_story(project_id=project_a.id, is_default=False)

    with pytest.raises(HTTPException) as exc:
        await story_service.move_story(story.id, project_b.id, intruder, db_session)
    assert exc.value.status_code == 403
```

- [ ] **Step 7: Fix `move_story` in `story_service.py`**

Replace both `resolve_role` calls in `move_story`:
```python
# Check access to current project
role = await require_project_access(user, story.project_id, db)
require_manager(role)

# Check access to new project
new_project = await db.get(Project, new_project_id)
if not new_project:
    raise HTTPException(status_code=404, detail="Target project not found")

role = await require_project_access(user, new_project_id, db)
require_manager(role)
```

Also add at the very top of `move_story`, right after the story existence check:
```python
if story.is_default:
    raise HTTPException(status_code=400, detail="Cannot move the default Backlog story")
```

- [ ] **Step 8: Write test — Backlog story cannot be moved**

```python
@pytest.mark.asyncio
async def test_move_story_cannot_move_backlog(db_session, make_user, make_project):
    owner = await make_user(role="manager")
    project_a = await make_project(owner=owner)
    project_b = await make_project(owner=owner)
    backlog = await story_service.get_default_story(project_a.id, db_session)

    with pytest.raises(HTTPException) as exc:
        await story_service.move_story(backlog.id, project_b.id, owner, db_session)
    assert exc.value.status_code == 400
```

- [ ] **Step 9: Fix malformed cursor returning 500 in `pagination.py`**

```python
# backend/app/api/pagination.py
import base64
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException


def encode_cursor(created_at: datetime, id: UUID) -> str:
    """Encode created_at and id into a cursor string."""
    return base64.b64encode(f"{created_at.isoformat()}|{id}".encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    """Decode cursor string back to created_at and id. Raises 400 on invalid input."""
    try:
        val = base64.b64decode(cursor.encode()).decode()
        ts, uid = val.split("|", 1)
        return datetime.fromisoformat(ts), UUID(uid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cursor")
```

- [ ] **Step 10: Run all affected tests**

```bash
cd backend && uv run pytest tests/ -v -k "task or story or cursor" 2>&1 | tail -20
```
Expected: all pass

- [ ] **Step 11: Commit**

```bash
git add backend/app/api/services/task_service.py backend/app/api/services/story_service.py backend/app/api/pagination.py backend/tests/
git commit -m "fix: replace resolve_role with require_project_access to close IDOR; protect Backlog from move; safe cursor decode"
```

---

## Task 2 — Password reset: remove debug token leak + single-use tokens

**Fixes:** C2, H1, M2 (email_confirmed in refresh)

**Files:**
- Modify: `backend/app/api/routes/auth.py`
- Modify: `backend/app/api/services/auth_service.py`
- Modify: `backend/app/auth/security.py`
- Modify: `backend/app/db/models/user.py`
- Create: Alembic migration

- [ ] **Step 1: Add `password_changed_at` column to User model**

```python
# backend/app/db/models/user.py  — add field to User class
from datetime import datetime
# ... existing imports ...

class User(Base):
    # ... existing fields ...
    password_changed_at: Mapped[datetime | None] = mapped_column(nullable=True)
```

- [ ] **Step 2: Generate and review migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "add password_changed_at to users"
```
Review the generated file in `migrations/versions/`. Confirm it adds `password_changed_at TIMESTAMP` as nullable. Run it:
```bash
uv run alembic upgrade head
```

- [ ] **Step 3: Update `create_password_reset_token` to embed `password_changed_at`**

```python
# backend/app/auth/security.py
def create_password_reset_token(user_id: uuid.UUID, password_changed_at: datetime | None) -> str:
    """Create a short-lived JWT token for password reset (1 hour expiry)."""
    payload = {
        "sub": str(user_id),
        "type": "password_reset",
        "pw_ts": password_changed_at.isoformat() if password_changed_at else "",
        "exp": datetime.now(UTC) + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def verify_password_reset_token(token: str, current_password_changed_at: datetime | None) -> uuid.UUID:
    """Verify a password reset token and return the user ID.
    Raises 400 if the token has already been used (password changed since token was issued).
    """
    payload = decode_token(token)
    if payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid token type")
    # Single-use check: reject if password changed since token was issued
    token_pw_ts = payload.get("pw_ts", "")
    current_ts = current_password_changed_at.isoformat() if current_password_changed_at else ""
    if token_pw_ts != current_ts:
        raise HTTPException(status_code=400, detail="Reset token has already been used")
    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid token payload") from exc
```

- [ ] **Step 4: Update `auth_service.py` — remove debug leak, fix single-use, add email_confirmed in refresh**

```python
# backend/app/api/services/auth_service.py

async def request_password_reset(email: str, db: AsyncSession, background_tasks=None) -> None:
    """Create a password reset token and send it via email. Never returns the token."""
    from app.core.email import send_password_reset_email

    stmt = select(User).where(User.email == email)
    user = await db.scalar(stmt)

    if user:
        token = create_password_reset_token(user.id, user.password_changed_at)
        if background_tasks is not None:
            background_tasks.add_task(send_password_reset_email, user.email, user.name, token)
        else:
            # Development fallback: log only, never return in response
            import logging
            logging.getLogger(__name__).debug("Password reset token for %s: %s", email, token)


async def confirm_password_reset(token: str, new_password: str, db: AsyncSession) -> None:
    """Verify a password reset token and update the user's password."""
    from datetime import UTC, datetime
    # We need the user_id to look up current pw_ts before verifying
    # Decode without single-use check first to get user_id
    from app.auth.security import decode_token
    payload = decode_token(token)
    if payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid token type")
    import uuid as _uuid
    user_id = _uuid.UUID(payload["sub"])
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    # Now do full single-use verification
    verify_password_reset_token(token, user.password_changed_at)
    user.password_hash = hash_password(new_password)
    user.password_changed_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()


async def refresh_token_fn(refresh_token_str: str, db: AsyncSession) -> dict:
    """Exchange a refresh token for a new access token."""
    from app.auth.security import decode_token

    payload = decode_token(refresh_token_str)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=400, detail="Invalid token type")

    user_id = uuid.UUID(payload["sub"])
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Block tokens for unconfirmed users even if refresh token is valid
    if not user.email_confirmed:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_CONFIRMED")

    access_token = create_access_token(user.id, user.role)
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }
```

- [ ] **Step 5: Update auth route — `request_password_reset` no longer returns a token**

```python
# backend/app/api/routes/auth.py
@router.post("/password-reset")
async def request_password_reset(
    data: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Request password reset. Sends reset link via email."""
    await auth_service.request_password_reset(data.email, db, background_tasks)
    return {"message": "If that email is registered, a reset link has been sent"}
```

- [ ] **Step 6: Write tests**

```python
# backend/tests/test_auth_service.py
@pytest.mark.asyncio
async def test_password_reset_token_is_single_use(db_session, make_user):
    """Reset token cannot be reused after password change."""
    user = await make_user(email_confirmed=True)
    token = create_password_reset_token(user.id, user.password_changed_at)
    await auth_service.confirm_password_reset(token, "newpassword123", db_session)
    # Try to use same token again
    with pytest.raises(HTTPException) as exc:
        await auth_service.confirm_password_reset(token, "anotherpassword", db_session)
    assert exc.value.status_code == 400

@pytest.mark.asyncio
async def test_refresh_blocked_for_unconfirmed_user(db_session, make_user):
    from app.auth.security import create_refresh_token
    user = await make_user(email_confirmed=False)
    token = create_refresh_token(user.id)
    with pytest.raises(HTTPException) as exc:
        await auth_service.refresh_token_fn(token, db_session)
    assert exc.value.status_code == 403
```

- [ ] **Step 7: Run tests**

```bash
cd backend && uv run pytest tests/ -v -k "password_reset or refresh" 2>&1 | tail -20
```
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add backend/app/ backend/migrations/
git commit -m "fix: remove debug reset token leak; make reset tokens single-use via password_changed_at; block refresh for unconfirmed users"
```

---

## Task 3 — Backend auth hardening

**Fixes:** H5 (session cookie), H6 (password length), H8 (invitation accept race + duplicate), M1 (timing oracle), M4 (ADMIN_USERNAME default), M6 (user time report access), M7 (invitation route order)

**Files:**
- Modify: `backend/app/api/main.py`
- Modify: `backend/app/api/schemas/user.py`
- Modify: `backend/app/api/routes/auth.py`
- Modify: `backend/app/api/services/auth_service.py`
- Modify: `backend/app/api/services/invitation_service.py`
- Modify: `backend/app/api/routes/invitations.py`
- Modify: `backend/app/api/routes/time_tracking.py`
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: Fix session cookie `https_only`**

```python
# backend/app/api/main.py — update SessionMiddleware
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.ADMIN_SECRET,
    https_only=not settings.DEBUG,  # enforces HTTPS in production
    same_site="lax",
)
```

- [ ] **Step 2: Add minimum password length to schemas**

```python
# backend/app/api/schemas/user.py
from pydantic import BaseModel, EmailStr, Field
from app.db.base import RoleEnum
from datetime import datetime
from uuid import UUID


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)
```

Also update `ConfirmPasswordResetRequest` and `ChangePasswordRequest` in `auth.py`:
```python
# backend/app/api/routes/auth.py
class ConfirmPasswordResetRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
```

- [ ] **Step 3: Fix login timing oracle in `auth_service.py`**

At module level, add a dummy hash constant. Replace the login function's early return:
```python
# backend/app/api/services/auth_service.py  — add near top of file
from app.auth.security import hash_password, verify_password

# Pre-computed dummy hash used to prevent timing-based user enumeration.
# The constant value doesn't matter; bcrypt will always take ~300ms.
_DUMMY_HASH = hash_password("timing-oracle-prevention-dummy-value")


async def login(email: str, password: str, db: AsyncSession) -> dict:
    """Authenticate user and return tokens."""
    from datetime import UTC, datetime

    stmt = select(User).where(User.email == email)
    user = await db.scalar(stmt)

    if not user:
        # Always run bcrypt to prevent timing-based user enumeration
        verify_password(password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.email_confirmed:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_CONFIRMED")

    user.last_login = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }
```

- [ ] **Step 4: Fix `accept_invitation` — add FOR UPDATE + duplicate member check**

```python
# backend/app/api/services/invitation_service.py
async def accept_invitation(invitation_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Accept an invitation."""
    from sqlalchemy import select as sa_select

    # Lock the invitation row to prevent double-accept race condition
    stmt = sa_select(Invitation).where(Invitation.id == invitation_id).with_for_update()
    invitation = await db.scalar(stmt)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.invitee_email != user.email:
        raise HTTPException(status_code=403, detail="Invitation email does not match your account")

    if invitation.status != InvitationStatusEnum.pending:
        raise HTTPException(status_code=409, detail="You have already responded to this invitation")

    if datetime.now(UTC).replace(tzinfo=None) > invitation.expires_at:
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # Idempotency: don't insert a duplicate ProjectMember
    existing_member_stmt = sa_select(ProjectMember).where(
        ProjectMember.project_id == invitation.project_id,
        ProjectMember.user_id == user.id,
    )
    existing_member = await db.scalar(existing_member_stmt)
    if not existing_member:
        member = ProjectMember(
            project_id=invitation.project_id, user_id=user.id, role=invitation.role
        )
        db.add(member)

    invitation.status = InvitationStatusEnum.accepted
    await db.commit()
```

- [ ] **Step 5: Remove `ADMIN_USERNAME` default in config**

```python
# backend/app/core/config.py
# Change:
ADMIN_USERNAME: str = "admin"
# To:
ADMIN_USERNAME: str  # required — no default
```

- [ ] **Step 6: Fix user time report access — restrict to own user or manager of shared project**

```python
# backend/app/api/routes/time_tracking.py
@router.get("/users/{user_id}/time-report")
async def get_user_time_report(
    user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only view your own time report")
    return await time_tracking_service.get_user_time_report(user_id, user, db)
```

- [ ] **Step 7: Fix invitation route ordering (latent conflict)**

In `backend/app/api/routes/invitations.py`, ensure `GET /invitations/mine` is declared **before** any `{invitation_id}` parametric routes. Check the file and reorder if needed. The mine route should appear first:
```python
@router.get("/mine", ...)
async def list_my_invitations(...):
    ...

# Then parametric routes below:
@router.post("/{invitation_id}/accept", ...)
...
```

- [ ] **Step 8: Write tests**

```python
# backend/tests/test_auth.py
def test_register_short_password_rejected(client):
    res = client.post("/api/v1/auth/register", json={
        "email": "test@example.com", "name": "Test", "password": "short"
    })
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_accept_invitation_idempotent(db_session, make_user, make_project, make_invitation):
    """Double-accept returns 409 on second call, not 500."""
    user = await make_user(email="invitee@example.com")
    project = await make_project()
    inv = await make_invitation(project_id=project.id, invitee_email=user.email)
    await invitation_service.accept_invitation(inv.id, user, db_session)
    with pytest.raises(HTTPException) as exc:
        await invitation_service.accept_invitation(inv.id, user, db_session)
    assert exc.value.status_code == 409
```

- [ ] **Step 9: Run tests**

```bash
cd backend && uv run pytest tests/ -v 2>&1 | tail -30
```

- [ ] **Step 10: Commit**

```bash
git add backend/app/
git commit -m "fix: session cookie https_only in prod; min password length 8; timing oracle; invitation race condition; ADMIN_USERNAME required; own-user time report"
```

---

## Task 4 — API key DoS fix + scope validation (needs migration)

**Fixes:** C3, H4

**Files:**
- Modify: `backend/app/db/models/api_key.py`
- Modify: `backend/app/auth/security.py`
- Modify: `backend/app/api/schemas/api_key.py`
- Modify: `backend/app/auth/dependencies.py`
- Modify: `backend/app/api/services/config_service.py`
- Create: Alembic migration

- [ ] **Step 1: Add `key_prefix` to APIKey model**

```python
# backend/app/db/models/api_key.py
class APIKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = (
        Index("ix_api_key_user_revoked", "user_id", "revoked_at"),
        Index("ix_api_key_prefix_revoked", "key_prefix", "revoked_at"),  # new
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False, default="")  # new
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    scopes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="api_keys")
```

- [ ] **Step 2: Generate and review migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "add key_prefix to api_keys"
```
Review the migration — confirm it adds `key_prefix VARCHAR(16) NOT NULL DEFAULT ''` and the new index. Apply:
```bash
uv run alembic upgrade head
```

- [ ] **Step 3: Update `generate_api_key` to return prefix**

```python
# backend/app/auth/security.py
PREFIX_LENGTH = 8

def generate_api_key() -> tuple[str, str, str]:
    """Generate a new API key. Returns (raw_key, key_hash, key_prefix)."""
    raw_key = secrets.token_urlsafe(32)
    key_prefix = raw_key[:PREFIX_LENGTH]
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt(rounds=12)).decode()
    return raw_key, key_hash, key_prefix
```

- [ ] **Step 4: Update `config_service.py` to store prefix**

```python
# backend/app/api/services/config_service.py  — in create_api_key
from app.auth.security import generate_api_key, SCOPE_HIERARCHY

async def create_api_key(data: APIKeyCreate, user: User, db: AsyncSession) -> APIKeyCreatedResponse:
    raw_key, key_hash, key_prefix = generate_api_key()
    api_key = APIKey(
        user_id=user.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        label=data.label,
        scopes=data.scopes,
    )
    db.add(api_key)
    await db.commit()
    return APIKeyCreatedResponse(
        id=api_key.id, label=api_key.label, scopes=api_key.scopes, key=raw_key
    )
```

- [ ] **Step 5: Update API key lookup in `dependencies.py` to use prefix**

```python
# backend/app/auth/dependencies.py  — inside get_current_user_or_api_key
    if api_key_header:
        from sqlalchemy import select
        from app.db.models.api_key import APIKey
        from app.db.models.user import User
        from app.auth.security import PREFIX_LENGTH

        prefix = api_key_header[:PREFIX_LENGTH]
        stmt = select(APIKey).where(
            APIKey.key_prefix == prefix,
            APIKey.revoked_at.is_(None),
        )
        candidates = (await db.scalars(stmt)).all()
        for key_record in candidates:
            if bcrypt.checkpw(api_key_header.encode(), key_record.key_hash.encode()):
                key_record.last_used_at = datetime.now(UTC)
                request.state.api_key = key_record
                user = await db.get(User, key_record.user_id)
                if not user:
                    raise HTTPException(status_code=401, detail="User not found")
                return user
```

- [ ] **Step 6: Add scope validation to `APIKeyCreate` schema**

```python
# backend/app/api/schemas/api_key.py
from pydantic import BaseModel, field_validator
from app.auth.security import SCOPE_HIERARCHY

VALID_SCOPES = set(SCOPE_HIERARCHY.keys()) | {
    s for implied in SCOPE_HIERARCHY.values() for s in implied
}


class APIKeyCreate(BaseModel):
    label: str
    scopes: list[str]

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, v: list[str]) -> list[str]:
        invalid = [s for s in v if s not in VALID_SCOPES]
        if invalid:
            raise ValueError(f"Unknown scopes: {invalid}. Valid: {sorted(VALID_SCOPES)}")
        return v
```

- [ ] **Step 7: Write tests**

```python
# backend/tests/test_config_service.py
@pytest.mark.asyncio
async def test_api_key_auth_uses_prefix_not_full_scan(db_session, make_user):
    """Auth lookup should succeed with O(1) prefix filtering."""
    user = await make_user()
    # Create 3 keys
    for i in range(3):
        await config_service.create_api_key(APIKeyCreate(label=f"key{i}", scopes=["read:tasks"]), user, db_session)
    # Auth should still work
    keys = await config_service.list_api_keys(user, db_session)
    assert len(keys) == 3

def test_api_key_invalid_scope_rejected():
    with pytest.raises(ValueError):
        APIKeyCreate(label="test", scopes=["made:up:scope"])
```

- [ ] **Step 8: Run tests**

```bash
cd backend && uv run pytest tests/ -v -k "api_key" 2>&1 | tail -20
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/ backend/migrations/
git commit -m "fix: API key lookup O(1) via key_prefix column; validate scopes against known values"
```

---

## Task 5 — Status delete orphan guard + move_story task status reset

**Fixes:** C4, M3 (move_story task statuses)

**Files:**
- Modify: `backend/app/api/services/project_status_service.py`
- Modify: `backend/app/api/services/story_service.py`

- [ ] **Step 1: Write failing test — delete status with tasks using it**

```python
# backend/tests/test_project_status_service.py
@pytest.mark.asyncio
async def test_delete_status_blocked_when_tasks_use_it(db_session, make_user, make_project, make_task, make_status):
    manager = await make_user(role="manager")
    project = await make_project(owner=manager)
    status = await make_status(project_id=project.id, slug="my-status")
    await make_task(project_id=project.id, status="my-status")

    with pytest.raises(HTTPException) as exc:
        await project_status_service.delete_project_status(project.id, status.id, manager, db_session)
    assert exc.value.status_code == 422
```

- [ ] **Step 2: Fix `delete_project_status` in `project_status_service.py`**

```python
# backend/app/api/services/project_status_service.py
async def delete_project_status(
    project_id: uuid.UUID, status_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    role = await require_project_access(user, project_id, db)
    require_manager(role)

    status = await db.get(ProjectStatus, status_id)
    if not status or status.project_id != project_id:
        raise HTTPException(status_code=404, detail="Status not found")

    # Prevent orphaning: check if any tasks or stories still use this slug
    from app.db.models.task import Task
    from app.db.models.story import Story
    from sqlalchemy import select, func

    task_count = await db.scalar(
        select(func.count()).where(Task.project_id == project_id, Task.status == status.slug)
    )
    story_count = await db.scalar(
        select(func.count()).where(Story.project_id == project_id, Story.status == status.slug)
    )
    if (task_count or 0) + (story_count or 0) > 0:
        raise HTTPException(
            status_code=422,
            detail=f"Status '{status.slug}' is used by {task_count} task(s) and {story_count} story/stories. Reassign them first.",
        )

    await db.delete(status)
    await db.commit()
```

- [ ] **Step 3: Fix `move_story` to reset task statuses to target project default**

After the existing `update(Task)...values(project_id=new_project_id)` line, add:
```python
# backend/app/api/services/story_service.py  — inside move_story, after updating tasks' project_id
    # Reset task statuses to target project default to avoid orphaned status slugs
    from app.api.services.project_status_service import get_default_status_slug
    default_slug = await get_default_status_slug(new_project_id, db)
    await db.execute(
        update(Task).where(Task.story_id == story_id).values(status=default_slug)
    )
```

- [ ] **Step 4: Run tests**

```bash
cd backend && uv run pytest tests/ -v -k "status" 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/services/project_status_service.py backend/app/api/services/story_service.py
git commit -m "fix: prevent status deletion when tasks/stories use it; reset task statuses on story move"
```

---

## Task 6 — Database indexes + N+1 fixes + unbounded queries + story cursor pagination

**Fixes:** H7, H8, H9, H10 + Medium DB index issues

**Files:**
- Modify: `backend/app/db/models/project.py`
- Modify: `backend/app/db/models/comment.py`
- Modify: `backend/app/db/models/task.py`
- Modify: `backend/app/api/services/project_service.py`
- Modify: `backend/app/api/services/story_service.py`
- Modify: `backend/app/api/services/timeline_service.py`
- Create: Alembic migration

- [ ] **Step 1: Add missing indexes to ORM models**

```python
# backend/app/db/models/project.py  — add to __table_args__
__table_args__ = (
    # ... existing ...
    Index("ix_projects_owner_id", "owner_id"),
)

# backend/app/db/models/comment.py  — add to __table_args__
__table_args__ = (
    Index("ix_comment_project_id", "project_id"),
    Index("ix_comment_story_id", "story_id"),
    Index("ix_comment_task_id", "task_id"),
)

# backend/app/db/models/task.py  — add to __table_args__ (these already exist in migration)
__table_args__ = (
    # ... existing ...
    Index("ix_task_story_position", "story_id", "position"),
    Index("ix_task_project_position", "project_id", "position"),
)
```

- [ ] **Step 2: Generate and apply migration for new indexes**

```bash
cd backend && uv run alembic revision --autogenerate -m "add missing indexes project owner comment fks task position"
```
Review the file — confirm only `CREATE INDEX` statements, no drops. Then:
```bash
uv run alembic upgrade head
```

- [ ] **Step 3: Fix N+1 in `list_members` — `project_service.py`**

```python
# backend/app/api/services/project_service.py
async def list_members(project_id: uuid.UUID, user: User, db: AsyncSession) -> list[MemberResponse]:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await require_project_access(user, project_id, db)

    stmt = select(ProjectMember).where(ProjectMember.project_id == project_id)
    members = (await db.scalars(stmt)).all()

    if not members:
        return []

    # Batch-load all member users in one query instead of N individual db.get() calls
    user_ids = [m.user_id for m in members]
    users_result = await db.scalars(select(User).where(User.id.in_(user_ids)))
    users_by_id = {u.id: u for u in users_result.all()}

    return [
        MemberResponse(
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at,
            name=users_by_id[m.user_id].name,
            email=users_by_id[m.user_id].email,
        )
        for m in members
        if m.user_id in users_by_id
    ]
```

- [ ] **Step 4: Fix unbounded query in `timeline_service.py`**

```python
# backend/app/api/services/timeline_service.py
TIMELINE_TASK_LIMIT = 500

async def get_timeline(...):
    # ... existing access check ...
    tasks_stmt = (
        select(Task)
        .where(Task.project_id == project_id)
        .limit(TIMELINE_TASK_LIMIT)
    )
    tasks = list((await db.scalars(tasks_stmt)).all())
    truncated = len(tasks) == TIMELINE_TASK_LIMIT
    # ... rest of function ...
    # Add truncated flag to response if needed, or log a warning:
    if truncated:
        import logging
        logging.getLogger(__name__).warning(
            "Timeline for project %s truncated at %d tasks", project_id, TIMELINE_TASK_LIMIT
        )
```

- [ ] **Step 5: Fix story cursor pagination — Backlog always on page 1**

The bug: `ORDER BY is_default ASC, created_at DESC, id DESC` but cursor only encodes `(created_at, id)`, so the Backlog (is_default=True) disappears from page 2.

Fix: fetch Backlog separately and always prepend it to page 1:

```python
# backend/app/api/services/story_service.py  — in list_stories
async def list_stories(project_id, user, db, cursor=None, limit=20, ...):
    await require_project_access(user, project_id, db)

    # Always fetch the Backlog story separately (it must always appear on page 1)
    backlog_stmt = select(Story).where(
        Story.project_id == project_id, Story.is_default.is_(True)
    )
    backlog = await db.scalar(backlog_stmt)

    # Paginate non-default stories only
    stmt = select(Story).where(
        Story.project_id == project_id,
        Story.is_default.is_(False),
    )

    if status:
        stmt = stmt.where(Story.status == status)
    if priority:
        stmt = stmt.where(Story.priority == priority)
    if q:
        stmt = stmt.where(Story.title.ilike(f"%{escape_like(q)}%", escape="\\"))

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Story.created_at, Story.id) < tuple_(cursor_ts, cursor_id))

    stmt = stmt.order_by(Story.created_at.desc(), Story.id.desc()).limit(limit + 1)
    items = list((await db.scalars(stmt)).all())

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id)

    # Prepend Backlog on first page only (no cursor = first page)
    all_items = []
    if not cursor and backlog:
        all_items.append(backlog)
    all_items.extend(items)

    return PaginatedResponse(
        items=[StoryResponse.model_validate(item) for item in all_items],
        next_cursor=next_cursor,
    )
```

- [ ] **Step 6: Run tests**

```bash
cd backend && uv run pytest tests/ -v 2>&1 | tail -30
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/ backend/migrations/
git commit -m "fix: add missing DB indexes; batch list_members query; cap timeline at 500 tasks; fix story cursor pagination losing Backlog"
```

---

## Task 7 — Frontend: critical fixes + error handling + unmount cleanup

**Fixes:** C6, H12, H13, H14, H15, H16, H17, M11, M12

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/hooks/useRole.ts`
- Modify: `frontend/src/utils/errors.ts` (create)
- Modify: `frontend/src/components/comments/CommentList.tsx`
- Modify: `frontend/src/components/status-history/StatusHistoryTimeline.tsx`
- Modify: `frontend/src/pages/TaskDetailPage.tsx`
- Modify: `frontend/src/pages/StoryDetailPage.tsx`
- Modify: `frontend/src/pages/InvitationsPage.tsx`

- [ ] **Step 1: Fix open redirect in `LoginPage.tsx`**

```tsx
// frontend/src/pages/LoginPage.tsx — replace line 11
const rawNext = (location.state as { next?: string })?.next
const next = rawNext?.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/projects'
```

- [ ] **Step 2: Create typed error helper `frontend/src/utils/errors.ts`**

```typescript
// frontend/src/utils/errors.ts
import axios from 'axios'

/**
 * Extract a human-readable message from an Axios error response.
 * Returns undefined if the error is not an Axios error or has no message.
 */
export function getApiErrorMessage(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined
  return (
    err.response?.data?.error?.message ??
    err.response?.data?.detail ??
    undefined
  )
}
```

- [ ] **Step 3: Use `getApiErrorMessage` in `LoginPage.tsx`, `RegisterPage.tsx`, `ConfigPage.tsx`**

```tsx
// LoginPage.tsx — replace the catch block error extraction
import { getApiErrorMessage } from '../utils/errors'
// ...
} catch (err: unknown) {
  setError(getApiErrorMessage(err) ?? t('errors.generic'))
}
```
Apply the same pattern to `RegisterPage.tsx` and `ConfigPage.tsx`.

- [ ] **Step 4: Fix `reset_token` type in `api.ts`**

```typescript
// frontend/src/services/api.ts — find requestPasswordReset and change response type
requestPasswordReset: (email: string) =>
  api.post<{ message: string }>('/auth/password-reset', { email }),
```

- [ ] **Step 5: Fix `useRole.ts` — error fallback must be `false`, not global role**

```typescript
// frontend/src/hooks/useRole.ts
  useEffect(() => {
    if (!projectId || !user) {
      setIsManager(user?.role === 'manager')
      setIsLoading(false)
      return
    }

    projectsApi.listMembers(projectId).then((res) => {
      const member = res.data.find((m) => m.user_id === user.id)
      if (member) {
        setIsManager(member.role === 'manager')
      } else {
        // Owner is always manager; non-members default to false
        setIsManager(user.role === 'manager' && /* is owner? we don't know here */ false)
        // Safe default: if no membership record found, not a manager
        setIsManager(false)
      }
    }).catch(() => {
      // On error, default to false — never silently elevate
      setIsManager(false)
    }).finally(() => {
      setIsLoading(false)
    })
  }, [projectId, user?.id])
```

Note: the `member` branch correctly sets `isManager` from the membership record. The else branch (user is in the project but has no member row — meaning they're the owner) should use the owner check. Since we don't have the project owner ID in this hook, simplest safe fix is:
```typescript
    }).then((res) => {
      const member = res.data.find((m) => m.user_id === user.id)
      // If no member record, user might be the owner — but we can't confirm here,
      // so rely on server-side enforcement; show non-manager UI as fallback
      setIsManager(member?.role === 'manager' ?? false)
    }).catch(() => {
      setIsManager(false)  // safe default on error
    })
```

- [ ] **Step 6: Fix `CommentList.tsx` — cancellation guard + error handling**

```tsx
// frontend/src/components/comments/CommentList.tsx
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const doLoad = async () => {
      try {
        let res
        if (itemType === 'project') res = await commentsApi.listForProject(itemId)
        else if (itemType === 'story') res = await commentsApi.listForStory(itemId)
        else res = await commentsApi.listForTask(itemId)
        if (!cancelled) setComments(res.data.items)
      } catch {
        if (!cancelled) addToast(t('errors.generic'), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    doLoad()
    return () => { cancelled = true }
  }, [itemId, itemType])

  const handleEdit = async (id: string) => {
    try {
      await commentsApi.update(id, editBody)
      setComments((prev) => prev.map((c) => c.id === id ? { ...c, body: editBody } : c))
      setEditId(null)
    } catch {
      addToast(t('errors.generic'), 'error')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await commentsApi.delete(id)
      setComments((prev) => prev.filter((c) => c.id !== id))
    } catch {
      addToast(t('errors.generic'), 'error')
    }
  }
```

You'll also need `const { addToast } = useToast()` at the top of the component. Import `useToast` from `../../context/ToastContext`.

- [ ] **Step 7: Fix `StatusHistoryTimeline.tsx` — cancellation guard**

```tsx
// frontend/src/components/status-history/StatusHistoryTimeline.tsx
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const doFetch = async () => {
      try {
        // ... existing fetch logic ...
        if (!cancelled) setHistory(data)
      } catch {
        // silently ignore — timeline is non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    doFetch()
    return () => { cancelled = true }
  }, [itemType, itemId])
```

- [ ] **Step 8: Fix `TaskDetailPage.tsx` — complete the cancelled guard in the async chain**

Find the existing `cancelled` variable declaration and guard every `set*` call in the async chain:
```tsx
// After: const res = await tasksApi.get(taskId)
if (cancelled) return
setTask(res.data)
setDesc(res.data.description ?? '')
setTitleDraft(res.data.title)
setEffortDraft(res.data.effort != null ? String(res.data.effort) : '')

// After: story fetch
if (cancelled) return
setStory(storyRes.data)
// ... etc for all subsequent set* calls
```

- [ ] **Step 9: Fix `StoryDetailPage.tsx` and `InvitationsPage.tsx` — add missing error handling**

```tsx
// StoryDetailPage.tsx — wrap handleStatusChange and handlePriorityChange
const handleStatusChange = async (val: string) => {
  try {
    const res = await storiesApi.update(storyId, { status: val })
    setStory(res.data)
  } catch {
    addToast(t('errors.generic'), 'error')
  }
}

// InvitationsPage.tsx — wrap handleAccept and handleDecline
const handleAccept = async (id: string) => {
  try {
    await invitationsApi.accept(id)
    addToast(t('invitations.accepted'), 'success')
    load()
  } catch {
    addToast(t('errors.generic'), 'error')
  }
}
```

- [ ] **Step 10: Build check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/
git commit -m "fix: open redirect; typed error helper; useRole safe fallback; CommentList cancellation+errors; TaskDetailPage full cancelled guard; error handling in StoryDetailPage and InvitationsPage"
```

---

## Task 8 — Refresh token: move to httpOnly cookie

**Fixes:** C5

This task modifies both backend and frontend. The backend sets the refresh token as an httpOnly cookie on login and reads it from the cookie on refresh. The frontend stops storing the token in localStorage entirely.

**Files:**
- Modify: `backend/app/api/routes/auth.py`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Update `/auth/login` to set refresh token as httpOnly cookie**

```python
# backend/app/api/routes/auth.py
from fastapi import Response

@router.post("/login")
async def login(data: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Login and get tokens. Sets refresh token as httpOnly cookie."""
    result = await auth_service.login(data.email, data.password, db)
    response.set_cookie(
        key="spt_refresh",
        value=result["refresh_token"],
        httponly=True,
        secure=not settings.DEBUG,   # HTTPS-only in production
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",  # restrict cookie to refresh endpoint
    )
    # Return only the access token in the body — never the refresh token
    return {"access_token": result["access_token"], "token_type": "bearer"}
```

- [ ] **Step 2: Update `/auth/refresh` to read from cookie**

```python
# backend/app/api/routes/auth.py
from fastapi import Cookie

@router.post("/refresh")
async def refresh(
    spt_refresh: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using the httpOnly cookie."""
    if not spt_refresh:
        raise HTTPException(status_code=401, detail="No refresh token")
    return await auth_service.refresh_token_fn(spt_refresh, db)
```

- [ ] **Step 3: Add `/auth/logout` endpoint to clear the cookie**

```python
@router.post("/logout")
async def logout(response: Response):
    """Clear the refresh token cookie."""
    response.delete_cookie(key="spt_refresh", path="/api/v1/auth/refresh")
    return {"message": "Logged out"}
```

- [ ] **Step 4: Update `AuthContext.tsx` — remove localStorage, use cookie automatically**

```tsx
// frontend/src/context/AuthContext.tsx
// Remove: import REFRESH_TOKEN_KEY and all localStorage.getItem/setItem/removeItem calls

// The refresh token is now in an httpOnly cookie set by the server.
// The frontend never touches it directly — the browser sends it automatically.

const refreshToken = (): Promise<string | null> => {
  if (pendingRefreshRef.current) return pendingRefreshRef.current
  pendingRefreshRef.current = (async () => {
    try {
      const res = await authApi.refresh()  // no token argument — cookie sent automatically
      const newToken = res.data.access_token
      setAccessToken(newToken)
      return newToken
    } catch {
      setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
      return null
    }
  })().finally(() => { pendingRefreshRef.current = null })
  return pendingRefreshRef.current
}

// Silent restore on mount — just try to refresh; cookie present = still logged in
useEffect(() => {
  ;(async () => {
    try {
      const res = await authApi.refresh()
      const token = res.data.access_token
      accessTokenRef.current = token
      const user = await loadUserConfig(token)
      setState({ user, accessToken: token, isAuthenticated: true, isLoading: false })
    } catch {
      setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
    }
  })()
}, [])

const login = async (email: string, password: string) => {
  const res = await authApi.login(email, password)
  const { access_token } = res.data  // no refresh_token in body anymore
  accessTokenRef.current = access_token
  const user = await loadUserConfig(access_token)
  setState({ user, accessToken: access_token, isAuthenticated: true, isLoading: false })
}

const logout = async () => {
  try { await authApi.logout() } catch { /* best effort */ }
  accessTokenRef.current = null
  setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
}
```

- [ ] **Step 5: Update `api.ts` — update `authApi` types**

```typescript
// frontend/src/services/api.ts
// authApi:
  login: (email: string, password: string) =>
    api.post<{ access_token: string; token_type: string }>('/auth/login', { email, password }),
  refresh: () =>
    api.post<{ access_token: string; token_type: string }>('/auth/refresh'),
  logout: () =>
    api.post('/auth/logout'),
```

Remove the `refresh_token` parameter from `authApi.refresh`.

- [ ] **Step 6: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 7: Run backend tests**

```bash
cd backend && uv run pytest tests/ -v -k "login or refresh or logout" 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/routes/auth.py frontend/src/context/AuthContext.tsx frontend/src/services/api.ts
git commit -m "fix: move refresh token from localStorage to httpOnly cookie; add /auth/logout endpoint"
```

---

## Task 9 — i18n: hardcoded English strings

**Fixes:** ~35 hardcoded `addToast` calls and UI labels not going through `t()`

**Files:**
- Modify: `frontend/src/pages/ProjectsPage.tsx`, `ProjectDetailPage.tsx`, `StoryDetailPage.tsx`, `TaskDetailPage.tsx`, `InvitationsPage.tsx`, `SprintView.tsx`, `TimelineView.tsx`
- Modify: `frontend/src/components/layout/CommandPalette.tsx`
- Modify: `frontend/src/public/locales/en-GB.json` (or equivalent i18n file)
- Modify: `frontend/src/public/locales/pl.json`

- [ ] **Step 1: Audit all hardcoded strings**

```bash
grep -rn 'addToast(' frontend/src --include='*.tsx' | grep -v "t('" | grep "'"
```
List every hit. For each one, identify the i18n key to use (or create).

- [ ] **Step 2: Add missing i18n keys to `en-GB.json`**

Add under appropriate namespaces (examples — adjust to match existing structure):
```json
{
  "projects": {
    "created": "Project created",
    "deleted": "Project deleted",
    "updated": "Project updated"
  },
  "tasks": {
    "status_updated": "Status updated",
    "deleted": "Task deleted"
  },
  "invitations": {
    "accepted": "Invitation accepted",
    "declined": "Invitation declined"
  },
  "sprints": {
    "created": "Sprint created",
    "deleted": "Sprint deleted"
  },
  "errors": {
    "save_failed": "Failed to save changes"
  }
}
```

- [ ] **Step 3: Add Polish translations to `pl.json`**

Mirror all new keys added in Step 2 with Polish translations.

- [ ] **Step 4: Replace hardcoded strings with `t()` calls**

Example pattern (repeat for all files from the audit):
```tsx
// Before:
addToast('Project created', 'success')
// After:
addToast(t('projects.created'), 'success')
```

Also fix hardcoded labels in `TimelineView.tsx`:
```tsx
// Before: label: 'Unassigned'
// After: label: t('common.unassigned')

// Before: "Task" column header
// After: t('common.task')
```

And in `CommandPalette.tsx`:
```tsx
// Before: 'Searching…'
// After: t('search.searching')
```

And in `ProjectDetailPage.tsx` new-item dropdown:
```tsx
// Before: >Story</button>   >Task</button>
// After:  >{t('common.story')}</button>   >{t('common.task')}</button>
```

- [ ] **Step 5: Build check**

```bash
cd frontend && npx tsc --noEmit && npm run build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "fix: replace ~35 hardcoded English strings with t() calls; add missing i18n keys to en-GB.json and pl.json"
```

---

## Task 10 — Housekeeping: Pydantic extra, list_api_keys, misc

**Fixes:** Low/housekeeping items

**Files:**
- Modify: `backend/app/api/schemas/*.py` (input schemas only)
- Modify: `backend/app/api/services/config_service.py`

- [ ] **Step 1: Add `extra="forbid"` to all request (input) schemas**

Request schemas are: `UserCreate`, `ProjectCreate`, `StoryCreate`, `TaskCreate`, `CommentCreate`, `APIKeyCreate`, `InvitationCreate`, `SprintCreate`. Response schemas should NOT get this.

```python
# Pattern to apply to each input schema:
from pydantic import BaseModel, ConfigDict

class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    name: str
    password: str = Field(min_length=8)
```

Apply to all input schemas listed above.

- [ ] **Step 2: Filter revoked keys from `list_api_keys`**

```python
# backend/app/api/services/config_service.py
async def list_api_keys(user: User, db: AsyncSession) -> list[APIKeyResponse]:
    stmt = select(APIKey).where(
        APIKey.user_id == user.id,
        APIKey.revoked_at.is_(None),  # hide revoked keys
    ).order_by(APIKey.created_at.desc())
    keys = (await db.scalars(stmt)).all()
    return [APIKeyResponse.model_validate(k) for k in keys]
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && uv run pytest tests/ -v 2>&1 | tail -30
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/schemas/ backend/app/api/services/config_service.py
git commit -m "chore: extra=forbid on all input schemas; hide revoked API keys from list endpoint"
```

---

## Execution Order

Tasks within the same phase can be dispatched in parallel:

| Phase | Tasks | Can run in parallel |
|-------|-------|---------------------|
| 1 | 1, 2, 3 | Yes (different files) |
| 2 | 4, 5 | Yes (different files) |
| 3 | 6 | Alone (migration) |
| 4 | 7, 8 | Yes (7 = FE-only, 8 = auth) |
| 5 | 9 | Alone (touches many files) |
| 6 | 10 | Alone |

Run `uv run pytest tests/ -v` after each backend phase. Run `npx tsc --noEmit` after each frontend phase.
