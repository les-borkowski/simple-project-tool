# Implementation Plan: Database Layer

**Module**: `backend/app/db/`
**Depends on**: Nothing (foundation layer)
**Used by**: Auth layer, API layer, CLI (indirectly via API)

---

## Overview

The database layer owns all SQLAlchemy ORM models, the Alembic migration history, and the database connection/session management. No business logic lives here — only schema definitions and the `get_db()` session dependency. All other layers import models from here but never modify them.

---

## 1. Setup & Scaffolding

### 1.1 Python project (`backend/pyproject.toml`)
```toml
[project]
name = "simple-project-tool"
version = "0.1.0"
requires-python = ">=3.11"

dependencies = [
    "fastapi>=0.115",
    "sqlalchemy[asyncio]>=2.0",
    "alembic>=1.13",
    "asyncpg>=0.29",          # async PostgreSQL driver
    "psycopg2-binary>=2.9",   # sync driver for Alembic migrations
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "pyjwt>=2.8",
    "bcrypt>=4.1",
    "typer[all]>=0.12",
    "rich>=13",
    "httpx>=0.27",
    "babel>=2.14",
    "keyring>=25",
]

[project.scripts]
spt = "app.cli.main:app"

[tool.uv]
dev-dependencies = [
    "pytest>=8",
    "pytest-asyncio>=0.23",
    "pytest-cov>=5",
    "anyio>=4",
]

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]
```

### 1.2 Environment config (`backend/app/core/config.py`)
```
DATABASE_URL      — postgresql+asyncpg://user:pass@host/db
SYNC_DATABASE_URL — postgresql+psycopg2://user:pass@host/db  (Alembic only)
SECRET_KEY        — random 32-byte hex string
ACCESS_TOKEN_EXPIRE_MINUTES  — 15
REFRESH_TOKEN_EXPIRE_DAYS    — 7
CORS_ORIGINS      — comma-separated list of allowed origins
```
Use `pydantic-settings` `BaseSettings` to load from `.env`.

### 1.3 Directory structure to create
```
backend/
├── app/
│   ├── __init__.py
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py          # Settings (BaseSettings)
│   └── db/
│       ├── __init__.py
│       ├── database.py        # Engine + session factory
│       ├── base.py            # Base class + shared mixins + enums
│       └── models/
│           ├── __init__.py    # Import all models here
│           ├── user.py
│           ├── user_config.py
│           ├── project.py
│           ├── project_member.py
│           ├── story.py
│           ├── task.py
│           ├── comment.py
│           ├── status_history.py
│           ├── invitation.py
│           └── api_key.py
├── migrations/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
├── alembic.ini
├── pyproject.toml
└── .env.example
```

---

## 2. Database Connection (`backend/app/db/database.py`)

```python
# Tasks:
# 1. Create async engine from settings.DATABASE_URL
# 2. Create AsyncSessionLocal factory (expire_on_commit=False)
# 3. Define get_db() async generator for FastAPI Depends
# 4. Define check_db_connection() startup helper
```

Key choices:
- Use `create_async_engine` with `pool_size=10`, `max_overflow=20`
- `AsyncSession` with `autoflush=False` — explicit control
- `get_db()` uses `async with` to ensure session always closes

---

## 3. Base Class & Shared Enums (`backend/app/db/base.py`)

### 3.1 Enums (define as Python `enum.Enum`, map to PostgreSQL ENUM via SQLAlchemy)
```python
class StatusEnum(str, enum.Enum):
    to_do = "to_do"
    in_progress = "in_progress"
    in_review = "in_review"
    in_testing = "in_testing"
    done = "done"

class PriorityEnum(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"

class RoleEnum(str, enum.Enum):
    manager = "manager"
    contributor = "contributor"

class ThemeEnum(str, enum.Enum):
    light = "light"
    dark = "dark"
    system = "system"

class LocaleEnum(str, enum.Enum):
    en_gb = "en-GB"
    pl = "pl"

class InvitationStatusEnum(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    expired = "expired"
```

### 3.2 Base model class
```python
Base = declarative_base()

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())
```
Use `uuid.uuid4` as default for all `id` columns.

---

## 4. Models (implement in dependency order)

### 4.1 `user.py`
Columns: `id` (UUID PK), `email` (string unique not-null), `name` (string not-null), `password_hash` (string not-null), `role` (RoleEnum not-null default contributor), timestamps
Relationships: `projects_owned` (→ Project), `config` (→ UserConfig one-to-one), `api_keys` (→ APIKey), `memberships` (→ ProjectMember)

### 4.2 `user_config.py`
Columns: `user_id` (UUID PK FK→User), `theme` (ThemeEnum default system), `locale` (LocaleEnum default en-GB), `display_preferences` (JSON default {}), `updated_at`
Relationship: `user` back-populates User.config

### 4.3 `project.py`
Columns: `id` (UUID PK), `name` (string not-null), `description` (text nullable), `owner_id` (UUID FK→User not-null), `status` (StatusEnum default to_do), `priority` (PriorityEnum default medium), `archived_at` (datetime nullable), `created_by` (UUID FK→User not-null), `updated_by` (UUID FK→User nullable), timestamps
Note: `owner_id`, `created_by`, `updated_by` all FK to User — specify `foreign_keys=` explicitly on each relationship to avoid SQLAlchemy ambiguity.
Relationships: `owner`, `members` (→ ProjectMember), `stories` (→ Story), `invitations`

### 4.4 `project_member.py`
Columns: composite PK `(project_id, user_id)`, `role` (RoleEnum not-null), `joined_at` (datetime default now)
Relationships: `project`, `user`

### 4.5 `story.py`
Columns: `id` (UUID PK), `project_id` (UUID FK→Project not-null), `title` (string not-null), `description` (text nullable), `status` (StatusEnum default to_do), `priority` (PriorityEnum default medium), `created_by` (UUID FK→User), `updated_by` (UUID FK→User nullable), timestamps
Relationships: `project`, `tasks` (→ Task), `comments`, `status_history`

### 4.6 `task.py`
Columns: `id` (UUID PK), `story_id` (UUID FK→Story not-null), `title` (string not-null), `description` (text nullable), `status` (StatusEnum default to_do), `priority` (PriorityEnum default medium), `assignee_id` (UUID FK→User nullable), `created_by` (UUID FK→User), `updated_by` (UUID FK→User nullable), timestamps
Relationships: `story`, `assignee`, `comments`, `status_history`

### 4.7 `comment.py`
Columns: `id` (UUID PK), `project_id` (UUID FK→Project nullable), `story_id` (UUID FK→Story nullable), `task_id` (UUID FK→Task nullable), `author_id` (UUID FK→User not-null), `body` (text not-null), timestamps
**CHECK constraint** (add in migration, not model):
```sql
CHECK (num_nonnulls(project_id, story_id, task_id) = 1)
```
In SQLAlchemy model, add: `__table_args__ = (CheckConstraint("num_nonnulls(project_id, story_id, task_id) = 1", name="ck_comment_single_parent"),)`
Relationships: `project`, `story`, `task`, `author`

### 4.8 `status_history.py`
Columns: `id` (UUID PK), `project_id` (UUID FK→Project nullable), `story_id` (UUID FK→Story nullable), `task_id` (UUID FK→Task nullable), `from_status` (StatusEnum nullable — null on initial creation), `to_status` (StatusEnum not-null), `changed_by` (UUID FK→User not-null), `changed_at` (datetime default now not-null)
**No** `updated_at` — this table is append-only.
**CHECK constraint**: same pattern as Comment.
`__table_args__` includes CheckConstraint + all indexes (see section 5).

### 4.9 `invitation.py`
Columns: `id` (UUID PK), `project_id` (UUID FK→Project not-null), `inviter_id` (UUID FK→User not-null), `invitee_email` (string not-null), `role` (RoleEnum not-null default contributor), `status` (InvitationStatusEnum not-null default pending), `created_at` (datetime default now), `expires_at` (datetime not-null)
Relationships: `project`, `inviter`

### 4.10 `api_key.py`
Columns: `id` (UUID PK), `user_id` (UUID FK→User not-null), `key_hash` (string not-null), `label` (string not-null), `scopes` (JSON not-null default []), `last_used_at` (datetime nullable), `created_at` (datetime default now), `revoked_at` (datetime nullable)
Relationship: `user`

### 4.11 `models/__init__.py`
Import every model class here so Alembic's `env.py` picks them up automatically:
```python
from .user import User
from .user_config import UserConfig
from .project import Project
# ... all others
```

---

## 5. Indexes

Define in `__table_args__` on each model (SQLAlchemy `Index` objects), or add manually in the migration.

```python
# status_history — critical for time tracking queries
Index("ix_sh_project_changed_at", "project_id", "changed_at"),
Index("ix_sh_story_changed_at", "story_id", "changed_at"),
Index("ix_sh_task_changed_at", "task_id", "changed_at"),

# comment — filtered queries per parent
Index("ix_comment_project_id", "project_id", postgresql_where=text("project_id IS NOT NULL")),
Index("ix_comment_story_id", "story_id", postgresql_where=text("story_id IS NOT NULL")),
Index("ix_comment_task_id", "task_id", postgresql_where=text("task_id IS NOT NULL")),

# task
Index("ix_task_assignee_id", "assignee_id"),
Index("ix_task_story_status", "story_id", "status"),

# story
Index("ix_story_project_status", "project_id", "status"),

# invitation
Index("ix_invitation_email_status", "invitee_email", "status"),
Index("ix_invitation_project_id", "project_id"),

# api_key
Index("ix_api_key_user_revoked", "user_id", "revoked_at"),
```

---

## 6. Alembic Setup

1. Run `alembic init migrations` from `backend/`
2. Edit `alembic.ini`: set `script_location = migrations`
3. Edit `migrations/env.py`:
   - Import `Base` from `app.db.base` and all models via `app.db.models`
   - Set `target_metadata = Base.metadata`
   - Use `SYNC_DATABASE_URL` (psycopg2) for the migration connection
4. Generate initial migration: `alembic revision --autogenerate -m "initial schema"`
5. Review the generated migration file — verify:
   - CHECK constraints present for Comment and StatusHistory
   - All indexes present
   - Enum types created before tables that use them
6. Apply: `alembic upgrade head`

### `.env.example`
```
DATABASE_URL=postgresql+asyncpg://spt:password@localhost:5432/spt_dev
SYNC_DATABASE_URL=postgresql+psycopg2://spt:password@localhost:5432/spt_dev
SECRET_KEY=replace-with-32-random-bytes-hex
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=http://localhost:5173
```

---

## 7. Test Fixtures (`tests/conftest.py`)

```python
# Shared pytest fixtures:
# - test_engine: create_async_engine pointing to a test database
# - db_session: AsyncSession with transaction that rolls back after each test
# - test_user_manager: User with role=manager
# - test_user_contributor: User with role=contributor
# - test_project: Project owned by test_user_manager
```

Use `pytest-asyncio` with `asyncio_mode = "auto"` in `pyproject.toml`.

---

## 8. Testing Checklist

- [ ] All 10 tables created in PostgreSQL with correct column types and nullability
- [ ] `User.email` has a UNIQUE constraint
- [ ] `ProjectMember` composite PK enforced (duplicate insert → error)
- [ ] CHECK constraint on `Comment`: insert with two non-null FKs → IntegrityError
- [ ] CHECK constraint on `StatusHistory`: same
- [ ] All enums stored as strings (not integers) — verify with `SELECT * FROM pg_enum`
- [ ] All named indexes present — verify with `\d+ table_name` in psql
- [ ] `alembic downgrade -1` then `alembic upgrade head` works cleanly
- [ ] `get_db()` yields a session and closes it after use (no connection leak)
- [ ] `TimestampMixin.updated_at` updates automatically on row change
- [ ] `StatusHistory` has no `updated_at` column
