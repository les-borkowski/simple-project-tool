# Time Management Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sprints, effort tracking, sprint view, and timeline view to simple-project-tool.

**Architecture:** A new `Sprint` DB model is FK'd from `Task.sprint_id`. The timeline endpoint resolves each task's bar position server-side (deadline → sprint → status_history) so the frontend just renders bars. Sprint view and Timeline view are new pages reached via new tabs on ProjectDetailPage.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (backend), React 19 + TypeScript + Tailwind (frontend), pytest + httpx (tests)

**Spec:** `docs/superpowers/specs/2026-04-23-time-management-design.md`

---

## Codebase Orientation

**Backend layout:**
- `backend/app/db/models/` — SQLAlchemy models (add `sprint.py`; extend `task.py`, `project.py`)
- `backend/app/db/models/__init__.py` — re-exports all models (must add `Sprint`)
- `backend/app/api/schemas/` — Pydantic request/response schemas
- `backend/app/api/services/` — business logic (auth checks + DB queries)
- `backend/app/api/routes/` — FastAPI routers registered in `main.py`
- `backend/app/api/main.py` — app factory; import and `include_router` here
- `backend/tests/` — pytest integration tests using `api_client`, `manager_headers`, `test_project` fixtures

**Auth pattern used everywhere:**
```python
role = await require_project_access(user, project_id, db)  # 403/404 if no access
require_manager(role)  # 403 if not manager
```

**Model pattern:**
```python
class MyModel(TimestampMixin, Base):
    __tablename__ = "my_models"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
```

**Frontend layout:**
- `frontend/src/services/api.ts` — all types + all API client methods (grouped by domain)
- `frontend/src/hooks/` — data-fetching hooks (see `useProjectStatuses.ts` as pattern)
- `frontend/src/pages/` — page components
- `frontend/src/locales/en-GB.json` and `pl.json` — i18n keys
- `frontend/src/App.tsx` — React Router routes

---

## Task 1: Sprint DB model, Task/Project field extensions, migration

**Files:**
- Create: `backend/app/db/models/sprint.py`
- Modify: `backend/app/db/models/task.py`
- Modify: `backend/app/db/models/project.py`
- Modify: `backend/app/db/models/__init__.py`
- Create: `backend/alembic/versions/<hash>_add_sprints_and_effort_tracking.py` (auto-generated)

- [ ] **Step 1: Create Sprint model**

```python
# backend/app/db/models/sprint.py
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.project import Project
    from app.db.models.user import User


class Sprint(TimestampMixin, Base):
    __tablename__ = "sprints"
    __table_args__ = (Index("ix_sprints_project_id", "project_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    project: Mapped["Project"] = relationship("Project", back_populates="sprints")
    created_by_user: Mapped["User"] = relationship("User", foreign_keys=[created_by])
```

- [ ] **Step 2: Add Sprint relationship to Project model**

In `backend/app/db/models/project.py`, add the import and relationship:
```python
# Add to TYPE_CHECKING imports:
from app.db.models.sprint import Sprint

# Add to Project class, after the `tasks` relationship:
sprints: Mapped[list["Sprint"]] = relationship(
    "Sprint", back_populates="project", cascade="all, delete-orphan"
)
```

- [ ] **Step 3: Extend Task model with effort, due_date, sprint_id**

In `backend/app/db/models/task.py`, add these imports:
```python
from datetime import date
from sqlalchemy import Date, Integer
```

Add these fields to the `Task` class (after `created_by`):
```python
effort: Mapped[int | None] = mapped_column(Integer, nullable=True)
due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
sprint_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True), ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True
)
```

Add the relationship to `Task` class:
```python
# Add to TYPE_CHECKING imports:
from app.db.models.sprint import Sprint

# Add relationship:
sprint: Mapped["Sprint | None"] = relationship("Sprint", foreign_keys=[sprint_id])
```

- [ ] **Step 4: Extend Project model with effort_unit**

In `backend/app/db/models/project.py`, add to Project class (after `archived_at`):
```python
effort_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
```

- [ ] **Step 5: Register Sprint in models __init__**

In `backend/app/db/models/__init__.py`, add:
```python
from app.db.models.sprint import Sprint

# Add to __all__:
"Sprint",
```

- [ ] **Step 6: Generate Alembic migration**

```bash
cd backend
uv run alembic revision --autogenerate -m "add sprints and effort tracking"
```

Review the generated file in `backend/alembic/versions/`. Verify it contains:
- `op.create_table("sprints", ...)` with all Sprint columns and the index
- `op.add_column("tasks", sa.Column("effort", ...))` 
- `op.add_column("tasks", sa.Column("due_date", ...))` 
- `op.add_column("tasks", sa.Column("sprint_id", ...))` with FK referencing sprints
- `op.add_column("projects", sa.Column("effort_unit", ...))`

- [ ] **Step 7: Apply migration**

```bash
uv run alembic upgrade head
```

Expected: migration runs with no errors.

- [ ] **Step 8: Commit**

```bash
cd backend
git add app/db/models/sprint.py app/db/models/task.py app/db/models/project.py app/db/models/__init__.py alembic/versions/
git commit -m "feat: add Sprint model, effort/due_date/sprint_id to Task, effort_unit to Project"
```

---

## Task 2: Sprint schemas, service, routes, and tests

**Files:**
- Create: `backend/app/api/schemas/sprint.py`
- Create: `backend/app/api/services/sprint_service.py`
- Create: `backend/app/api/routes/sprints.py`
- Modify: `backend/app/api/main.py`
- Create: `backend/tests/test_api_sprints.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_api_sprints.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_sprint(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14", "capacity": 20},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Sprint 1"
    assert data["start_date"] == "2026-05-01"
    assert data["end_date"] == "2026-05-14"
    assert data["capacity"] == 20
    assert data["project_id"] == pid
    assert data["total_effort"] == 0
    assert data["task_count"] == 0


@pytest.mark.asyncio
async def test_list_sprints(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint A", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    resp = await api_client.get(f"/api/v1/projects/{pid}/sprints", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Sprint A"


@pytest.mark.asyncio
async def test_update_sprint(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sid = r.json()["id"]
    resp = await api_client.patch(
        f"/api/v1/sprints/{sid}",
        json={"name": "Sprint 1 (revised)", "capacity": 30},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Sprint 1 (revised)"
    assert resp.json()["capacity"] == 30


@pytest.mark.asyncio
async def test_delete_sprint(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sid = r.json()["id"]
    resp = await api_client.delete(f"/api/v1/sprints/{sid}", headers=manager_headers)
    assert resp.status_code == 204
    resp2 = await api_client.get(f"/api/v1/projects/{pid}/sprints", headers=manager_headers)
    assert resp2.json() == []


@pytest.mark.asyncio
async def test_create_sprint_requires_manager(
    api_client: AsyncClient, auth_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=auth_headers,
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_api_sprints.py -v
```

Expected: ImportError or 404 (routes don't exist yet).

- [ ] **Step 3: Create Sprint schemas**

```python
# backend/app/api/schemas/sprint.py
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class SprintCreate(BaseModel):
    name: str
    start_date: date
    end_date: date
    capacity: int | None = None


class SprintUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    capacity: int | None = None


class SprintResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    start_date: date
    end_date: date
    capacity: int | None
    created_by: UUID
    total_effort: int
    task_count: int

    class Config:
        from_attributes = True
```

- [ ] **Step 4: Create Sprint service**

```python
# backend/app/api/services/sprint_service.py
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.sprint import SprintCreate, SprintResponse, SprintUpdate
from app.auth.permissions import require_manager, require_project_access
from app.db.models import Task, User
from app.db.models.sprint import Sprint


async def list_sprints(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> list[SprintResponse]:
    await require_project_access(user, project_id, db)
    stmt = select(Sprint).where(Sprint.project_id == project_id).order_by(Sprint.start_date)
    sprints = list((await db.scalars(stmt)).all())
    return [await _build_response(s, db) for s in sprints]


async def create_sprint(
    project_id: uuid.UUID, data: SprintCreate, user: User, db: AsyncSession
) -> SprintResponse:
    role = await require_project_access(user, project_id, db)
    require_manager(role)
    sprint = Sprint(
        project_id=project_id,
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
        capacity=data.capacity,
        created_by=user.id,
    )
    db.add(sprint)
    await db.commit()
    return await _build_response(sprint, db)


async def update_sprint(
    sprint_id: uuid.UUID, data: SprintUpdate, user: User, db: AsyncSession
) -> SprintResponse:
    sprint = await db.get(Sprint, sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    role = await require_project_access(user, sprint.project_id, db)
    require_manager(role)
    if data.name is not None:
        sprint.name = data.name
    if data.start_date is not None:
        sprint.start_date = data.start_date
    if data.end_date is not None:
        sprint.end_date = data.end_date
    if data.capacity is not None:
        sprint.capacity = data.capacity
    await db.commit()
    return await _build_response(sprint, db)


async def delete_sprint(
    sprint_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    sprint = await db.get(Sprint, sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    role = await require_project_access(user, sprint.project_id, db)
    require_manager(role)
    await db.delete(sprint)
    await db.commit()


async def _build_response(sprint: Sprint, db: AsyncSession) -> SprintResponse:
    stmt = select(
        func.count(Task.id),
        func.coalesce(func.sum(Task.effort), 0),
    ).where(Task.sprint_id == sprint.id)
    row = (await db.execute(stmt)).one()
    task_count, total_effort = row
    return SprintResponse(
        id=sprint.id,
        project_id=sprint.project_id,
        name=sprint.name,
        start_date=sprint.start_date,
        end_date=sprint.end_date,
        capacity=sprint.capacity,
        created_by=sprint.created_by,
        total_effort=int(total_effort),
        task_count=int(task_count),
    )
```

- [ ] **Step 5: Create Sprint routes**

```python
# backend/app/api/routes/sprints.py
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.sprint import SprintCreate, SprintResponse, SprintUpdate
from app.api.services import sprint_service
from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User

router = APIRouter(tags=["sprints"])


@router.get("/projects/{project_id}/sprints", response_model=list[SprintResponse])
async def list_sprints(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await sprint_service.list_sprints(project_id, user, db)


@router.post("/projects/{project_id}/sprints", response_model=SprintResponse, status_code=201)
async def create_sprint(
    project_id: uuid.UUID,
    data: SprintCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await sprint_service.create_sprint(project_id, data, user, db)


@router.patch("/sprints/{sprint_id}", response_model=SprintResponse)
async def update_sprint(
    sprint_id: uuid.UUID,
    data: SprintUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await sprint_service.update_sprint(sprint_id, data, user, db)


@router.delete("/sprints/{sprint_id}", status_code=204)
async def delete_sprint(
    sprint_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await sprint_service.delete_sprint(sprint_id, user, db)
```

- [ ] **Step 6: Register sprint router in main.py**

In `backend/app/api/main.py`, add the import and include:
```python
from app.api.routes.sprints import router as sprints_router

# In the API routes section, add:
app.include_router(sprints_router, prefix="/api/v1")
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend
uv run pytest tests/test_api_sprints.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/schemas/sprint.py backend/app/api/services/sprint_service.py backend/app/api/routes/sprints.py backend/app/api/main.py backend/tests/test_api_sprints.py
git commit -m "feat: add Sprint CRUD endpoints with effort/task count aggregation"
```

---

## Task 3: Extend Task with effort, due_date, sprint_id + Project with effort_unit

**Files:**
- Modify: `backend/app/api/schemas/task.py`
- Modify: `backend/app/api/services/task_service.py`
- Modify: `backend/app/api/schemas/project.py`
- Modify: `backend/app/api/services/project_service.py`
- Modify: `backend/tests/test_api_tasks.py`

- [ ] **Step 1: Write failing tests**

Add these tests to `backend/tests/test_api_tasks.py` (at the end of the file):

```python
@pytest.mark.asyncio
async def test_task_update_effort_and_due_date(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    # Create a task
    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    # Update with effort and due_date
    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"effort": 5, "due_date": "2026-05-30"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["effort"] == 5
    assert data["due_date"] == "2026-05-30"


@pytest.mark.asyncio
async def test_task_update_sprint_id_validates_project(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    pid = test_project["id"]
    # Create a sprint in the same project
    sprint_r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "S1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sprint_id = sprint_r.json()["id"]

    # Create a task
    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    # Assign to sprint
    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"sprint_id": sprint_id},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["sprint_id"] == sprint_id


@pytest.mark.asyncio
async def test_task_update_sprint_id_wrong_project_rejected(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    # Create a second project and sprint in it
    proj2 = await api_client.post(
        "/api/v1/projects", json={"name": "Other Project"}, headers=manager_headers
    )
    pid2 = proj2.json()["id"]
    sprint_r = await api_client.post(
        f"/api/v1/projects/{pid2}/sprints",
        json={"name": "S1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sprint_id = sprint_r.json()["id"]

    # Create a task in test_project
    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    # Try to assign to sprint from other project
    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"sprint_id": sprint_id},
        headers=manager_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_project_update_effort_unit(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.patch(
        f"/api/v1/projects/{pid}",
        json={"effort_unit": "sp"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["effort_unit"] == "sp"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_api_tasks.py::test_task_update_effort_and_due_date tests/test_api_tasks.py::test_task_update_sprint_id_validates_project tests/test_api_tasks.py::test_task_update_sprint_id_wrong_project_rejected tests/test_api_tasks.py::test_project_update_effort_unit -v
```

Expected: FAIL (fields not in schema yet).

- [ ] **Step 3: Extend Task schemas**

Replace the contents of `backend/app/api/schemas/task.py`:

```python
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.db.base import PriorityEnum


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    status: str | None = None
    priority: PriorityEnum | None = None
    assignee_id: UUID | None = None
    effort: int | None = None
    due_date: date | None = None
    sprint_id: UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: PriorityEnum | None = None
    assignee_id: UUID | None = None
    effort: int | None = None
    due_date: date | None = None
    sprint_id: UUID | None = None


class TaskResponse(BaseModel):
    id: UUID
    project_id: UUID
    story_id: UUID | None
    sprint_id: UUID | None
    title: str
    description: str | None
    status: str
    priority: PriorityEnum
    assignee_id: UUID | None
    effort: int | None
    due_date: date | None
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] **Step 4: Extend Task service to handle sprint_id**

In `backend/app/api/services/task_service.py`, update the `update_task` function. After the existing `if data.assignee_id is not None:` block, add:

```python
    if data.effort is not None:
        task.effort = data.effort
    if data.due_date is not None:
        task.due_date = data.due_date
    if data.sprint_id is not None:
        from app.db.models.sprint import Sprint
        sprint = await db.get(Sprint, data.sprint_id)
        if not sprint or sprint.project_id != task.project_id:
            raise HTTPException(status_code=422, detail="Sprint not found in this project")
        task.sprint_id = data.sprint_id
```

Also update `create_task` and `create_task_for_project` to pass through `effort`, `due_date`, `sprint_id` from `data` if present. Add after the existing fields in the `Task(...)` constructor:
```python
        effort=data.effort,
        due_date=data.due_date,
        sprint_id=data.sprint_id,
```

- [ ] **Step 5: Extend Project schemas**

In `backend/app/api/schemas/project.py`, add `effort_unit: str | None = None` to `ProjectUpdate` and `effort_unit: str | None` to `ProjectResponse`.

- [ ] **Step 6: Extend Project service**

In `backend/app/api/services/project_service.py`, find the `update_project` function. Add handling for `effort_unit` alongside the existing field updates:

```python
    if data.effort_unit is not None:
        project.effort_unit = data.effort_unit
```

(If the function doesn't exist yet, check `patch_project` or similar — look in the file for the PATCH handler service function.)

- [ ] **Step 7: Run all tests**

```bash
cd backend
uv run pytest tests/test_api_tasks.py tests/test_api_projects.py -v
```

Expected: all new tests PASS, no existing tests broken.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/schemas/task.py backend/app/api/services/task_service.py backend/app/api/schemas/project.py backend/app/api/services/project_service.py backend/tests/test_api_tasks.py
git commit -m "feat: extend Task (effort, due_date, sprint_id) and Project (effort_unit) APIs"
```

---

## Task 4: Timeline backend — service, schema, route, tests

**Files:**
- Create: `backend/app/api/schemas/timeline.py`
- Create: `backend/app/api/services/timeline_service.py`
- Modify: `backend/app/api/routes/sprints.py` (add timeline route here)
- Create: `backend/tests/test_api_timeline.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_api_timeline.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_timeline_task_with_due_date(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    # Create task with due_date
    r = await api_client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"title": "Deadline task", "due_date": "2026-05-30"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.get(f"/api/v1/projects/{pid}/timeline", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert any(i["task_id"] == task_id and i["source"] == "deadline" for i in items)
    match = next(i for i in items if i["task_id"] == task_id)
    assert match["bar_end"] == "2026-05-30"


@pytest.mark.asyncio
async def test_timeline_task_in_sprint(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    # Create sprint
    sprint_r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sprint_id = sprint_r.json()["id"]

    # Create task in sprint (no due_date)
    r = await api_client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"title": "Sprint task", "sprint_id": sprint_id},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.get(f"/api/v1/projects/{pid}/timeline", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    match = next((i for i in items if i["task_id"] == task_id), None)
    assert match is not None
    assert match["source"] == "sprint"
    assert match["bar_start"] == "2026-05-01"
    assert match["bar_end"] == "2026-05-14"


@pytest.mark.asyncio
async def test_timeline_excludes_unstarted_tasks(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    # Create task with no due_date, no sprint — never started
    r = await api_client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"title": "Unstarted task"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.get(f"/api/v1/projects/{pid}/timeline", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert not any(i["task_id"] == task_id for i in items)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_api_timeline.py -v
```

Expected: FAIL (route not found).

- [ ] **Step 3: Create timeline schema**

```python
# backend/app/api/schemas/timeline.py
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.db.base import PriorityEnum


class TimelineTaskResponse(BaseModel):
    task_id: UUID
    title: str
    status: str
    priority: PriorityEnum
    story_id: UUID | None
    sprint_id: UUID | None
    bar_start: date
    bar_end: date
    source: Literal["deadline", "sprint", "status_history"]
```

- [ ] **Step 4: Create timeline service**

```python
# backend/app/api/services/timeline_service.py
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.timeline import TimelineTaskResponse
from app.auth.permissions import require_project_access
from app.db.models import StatusHistory, Task, User
from app.db.models.sprint import Sprint


async def get_timeline(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> list[TimelineTaskResponse]:
    await require_project_access(user, project_id, db)

    tasks_stmt = select(Task).where(Task.project_id == project_id)
    tasks = list((await db.scalars(tasks_stmt)).all())

    if not tasks:
        return []

    task_ids = [t.id for t in tasks]

    # Load all real transitions (from_status IS NOT NULL) for these tasks
    history_stmt = (
        select(StatusHistory)
        .where(
            StatusHistory.task_id.in_(task_ids),
            StatusHistory.from_status.isnot(None),
        )
        .order_by(StatusHistory.changed_at)
    )
    history_rows = list((await db.scalars(history_stmt)).all())

    # Group history by task_id
    first_transition: dict[uuid.UUID, date] = {}
    last_transition: dict[uuid.UUID, date] = {}
    for row in history_rows:
        tid = row.task_id
        d = row.changed_at.date()
        if tid not in first_transition:
            first_transition[tid] = d
        last_transition[tid] = d

    # Load sprints for tasks that have sprint_id
    sprint_ids = {t.sprint_id for t in tasks if t.sprint_id is not None}
    sprints: dict[uuid.UUID, Sprint] = {}
    if sprint_ids:
        sprint_stmt = select(Sprint).where(Sprint.id.in_(sprint_ids))
        for s in await db.scalars(sprint_stmt):
            sprints[s.id] = s

    results: list[TimelineTaskResponse] = []
    for task in tasks:
        bar_start: date | None = None
        bar_end: date | None = None
        source: str | None = None

        if task.due_date is not None:
            bar_end = task.due_date
            bar_start = first_transition.get(task.id, task.created_at.date())
            source = "deadline"
        elif task.sprint_id is not None and task.sprint_id in sprints:
            sprint = sprints[task.sprint_id]
            bar_start = sprint.start_date
            bar_end = sprint.end_date
            source = "sprint"
        elif task.id in first_transition:
            bar_start = first_transition[task.id]
            bar_end = last_transition[task.id]
            source = "status_history"
        else:
            continue  # exclude — no position resolvable

        results.append(
            TimelineTaskResponse(
                task_id=task.id,
                title=task.title,
                status=task.status,
                priority=task.priority,
                story_id=task.story_id,
                sprint_id=task.sprint_id,
                bar_start=bar_start,
                bar_end=bar_end,
                source=source,
            )
        )

    return results
```

- [ ] **Step 5: Add timeline route to sprints.py**

In `backend/app/api/routes/sprints.py`, add this import and route:

```python
from app.api.schemas.timeline import TimelineTaskResponse
from app.api.services import timeline_service

@router.get("/projects/{project_id}/timeline", response_model=list[TimelineTaskResponse])
async def get_project_timeline(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await timeline_service.get_timeline(project_id, user, db)
```

- [ ] **Step 6: Run tests**

```bash
cd backend
uv run pytest tests/test_api_timeline.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
cd backend
uv run pytest -v
```

Expected: all existing tests still PASS.

- [ ] **Step 8: Lint**

```bash
cd backend
uv run ruff check . && uv run ruff format .
```

Fix any issues.

- [ ] **Step 9: Commit**

```bash
git add backend/app/api/schemas/timeline.py backend/app/api/services/timeline_service.py backend/app/api/routes/sprints.py backend/tests/test_api_timeline.py
git commit -m "feat: add timeline endpoint with deadline/sprint/status_history fallback"
```

---

## Task 5: Frontend types, API client, and useProjectSprints hook

**Files:**
- Modify: `frontend/src/services/api.ts`
- Create: `frontend/src/hooks/useProjectSprints.ts`

- [ ] **Step 1: Add Sprint and Timeline types to api.ts**

In `frontend/src/services/api.ts`, add after `ProjectStatusResponse`:

```typescript
export interface SprintResponse {
  id: string
  project_id: string
  name: string
  start_date: string  // ISO date string "YYYY-MM-DD"
  end_date: string
  capacity: number | null
  created_by: string
  total_effort: number
  task_count: number
}

export interface TimelineTask {
  task_id: string
  title: string
  status: Status
  priority: Priority
  story_id: string | null
  sprint_id: string | null
  bar_start: string  // ISO date string "YYYY-MM-DD"
  bar_end: string
  source: 'deadline' | 'sprint' | 'status_history'
}
```

- [ ] **Step 2: Update TaskResponse type in api.ts**

Find `export interface TaskResponse` and add these fields:

```typescript
  sprint_id: string | null
  effort: number | null
  due_date: string | null  // ISO date string "YYYY-MM-DD"
```

- [ ] **Step 3: Update ProjectResponse type in api.ts**

Find `export interface ProjectResponse` and add:

```typescript
  effort_unit: string | null
```

- [ ] **Step 4: Add sprintsApi to api.ts**

After the `statusesApi` block, add:

```typescript
// ---------------------------------------------------------------------------
// Sprints API
// ---------------------------------------------------------------------------

export const sprintsApi = {
  list: (projectId: string) =>
    api.get<SprintResponse[]>(`/projects/${projectId}/sprints`),
  create: (
    projectId: string,
    data: { name: string; start_date: string; end_date: string; capacity?: number | null }
  ) => api.post<SprintResponse>(`/projects/${projectId}/sprints`, data),
  update: (
    sprintId: string,
    data: { name?: string; start_date?: string; end_date?: string; capacity?: number | null }
  ) => api.patch<SprintResponse>(`/sprints/${sprintId}`, data),
  delete: (sprintId: string) => api.delete(`/sprints/${sprintId}`),
}

// ---------------------------------------------------------------------------
// Timeline API
// ---------------------------------------------------------------------------

export const timelineApi = {
  get: (projectId: string) =>
    api.get<TimelineTask[]>(`/projects/${projectId}/timeline`),
}
```

- [ ] **Step 5: Update tasksApi update method signature in api.ts**

Find `tasksApi.update` and extend the partial type to include:
```typescript
  update: (id: string, data: Partial<{ title: string; description: string; status: Status; priority: Priority; assignee_id: string | null; effort: number | null; due_date: string | null; sprint_id: string | null }>) =>
    api.patch<TaskResponse>(`/tasks/${id}`, data),
```

- [ ] **Step 6: Update projectsApi update method to include effort_unit**

Find `projectsApi.update` and extend:
```typescript
  update: (id: string, data: Partial<{ name: string; description: string; status: Status; priority: Priority; effort_unit: string | null }>) =>
    api.patch<ProjectResponse>(`/projects/${id}`, data),
```

- [ ] **Step 7: Create useProjectSprints hook**

```typescript
// frontend/src/hooks/useProjectSprints.ts
import { useCallback, useEffect, useState } from 'react'
import { sprintsApi } from '../services/api'
import type { SprintResponse } from '../services/api'

export function useProjectSprints(projectId: string | undefined) {
  const [sprints, setSprints] = useState<SprintResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await sprintsApi.list(projectId)
      setSprints(res.data)
    } catch {
      setError('Failed to load sprints')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { sprints, loading, error, refresh: fetch }
}
```

- [ ] **Step 8: Check TypeScript compiles**

```bash
cd frontend
npm run lint
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/hooks/useProjectSprints.ts
git commit -m "feat: add Sprint and Timeline types, API methods, and useProjectSprints hook"
```

---

## Task 6: SprintView page + navigation tabs + i18n

**Files:**
- Create: `frontend/src/pages/SprintView.tsx`
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/locales/en-GB.json`
- Modify: `frontend/src/locales/pl.json`

- [ ] **Step 1: Add i18n keys**

In `frontend/src/locales/en-GB.json`, add (inside the JSON object, before the closing `}`):

```json
  "sprints.title": "Sprints",
  "sprints.create": "New sprint",
  "sprints.empty": "No sprints yet",
  "sprints.name": "Sprint name",
  "sprints.start_date": "Start date",
  "sprints.end_date": "End date",
  "sprints.capacity": "Capacity",
  "sprints.capacity_optional": "Capacity (optional)",
  "sprints.effort_of": "{{used}} / {{capacity}}",
  "sprints.over_capacity": "Over capacity",
  "sprints.unassigned": "Unassigned tasks",
  "sprints.assign_sprint": "Assign to sprint",
  "sprints.no_sprint": "No sprint",
  "effort.unit_label": "Effort unit",
  "effort.enable": "Enable effort tracking",
  "timeline.title": "Timeline",
  "timeline.empty": "No tasks with timeline data",
  "timeline.source_deadline": "Deadline",
  "timeline.source_sprint": "Sprint",
  "timeline.source_history": "Status history"
```

In `frontend/src/locales/pl.json`, add the same keys with Polish translations:

```json
  "sprints.title": "Sprinty",
  "sprints.create": "Nowy sprint",
  "sprints.empty": "Brak sprintów",
  "sprints.name": "Nazwa sprintu",
  "sprints.start_date": "Data rozpoczęcia",
  "sprints.end_date": "Data zakończenia",
  "sprints.capacity": "Pojemność",
  "sprints.capacity_optional": "Pojemność (opcjonalnie)",
  "sprints.effort_of": "{{used}} / {{capacity}}",
  "sprints.over_capacity": "Przekroczona pojemność",
  "sprints.unassigned": "Nieprzypisane zadania",
  "sprints.assign_sprint": "Przypisz do sprintu",
  "sprints.no_sprint": "Bez sprintu",
  "effort.unit_label": "Jednostka wysiłku",
  "effort.enable": "Włącz śledzenie wysiłku",
  "timeline.title": "Oś czasu",
  "timeline.empty": "Brak zadań z danymi czasowymi",
  "timeline.source_deadline": "Termin",
  "timeline.source_sprint": "Sprint",
  "timeline.source_history": "Historia statusów"
```

- [ ] **Step 2: Add Sprints and Timeline tabs to ProjectDetailPage**

In `frontend/src/pages/ProjectDetailPage.tsx`:

Find `type Tab = 'board' | 'stories' | 'members'` and replace with:
```typescript
type Tab = 'board' | 'stories' | 'members' | 'sprints' | 'timeline'
```

Find the tab buttons rendering section (look for the board/stories/members tab buttons) and add two more tab buttons following the exact same pattern as the existing ones:

```tsx
<button
  onClick={() => setTab('sprints')}
  className={`tab-btn ${tab === 'sprints' ? 'tab-btn-active' : ''}`}
>
  <ISprint />
  {t('sprints.title')}
</button>
<button
  onClick={() => setTab('timeline')}
  className={`tab-btn ${tab === 'timeline' ? 'tab-btn-active' : ''}`}
>
  <ITimeline />
  {t('timeline.title')}
</button>
```

Add these SVG icon components at the top of the file alongside the other icon components:
```tsx
const ISprint = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
  </svg>
)
const ITimeline = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    <circle cx="7" cy="6" r="2" fill="currentColor"/><circle cx="14" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>
  </svg>
)
```

In the tab content section (where `{tab === 'board' && ...}` etc. are rendered), add:
```tsx
{tab === 'sprints' && id && <SprintView projectId={id} />}
{tab === 'timeline' && id && <TimelineView projectId={id} />}
```

Add imports at the top of ProjectDetailPage:
```typescript
import { SprintView } from './SprintView'
import { TimelineView } from './TimelineView'
```

- [ ] **Step 3: Create SprintView component**

```tsx
// frontend/src/pages/SprintView.tsx
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sprintsApi, tasksApi, projectsApi } from '../services/api'
import type { SprintResponse, TaskResponse, Status } from '../services/api'
import { useProjectSprints } from '../hooks/useProjectSprints'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { useRole } from '../hooks/useRole'
import { useToast } from '../context/ToastContext'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

const IPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)
const IChevron = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 9l6 6 6-6"/>
  </svg>
)

function formatDateRange(start: string, end: string): string {
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return `${fmt(start)} – ${fmt(end)}`
}

function SprintCard({
  sprint,
  tasks,
  projectId,
  effortUnit,
  statuses,
  isManager,
  onRefresh,
}: {
  sprint: SprintResponse
  tasks: TaskResponse[]
  projectId: string
  effortUnit: string | null
  statuses: { slug: string; name: string; colour: string }[]
  isManager: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const { addToast } = useToast()
  const [collapsed, setCollapsed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const overCapacity = sprint.capacity !== null && sprint.total_effort > sprint.capacity

  const handleDelete = async () => {
    try {
      await sprintsApi.delete(sprint.id)
      onRefresh()
    } catch {
      addToast(t('common.error'), 'error')
    }
    setDeleting(false)
  }

  const handleStatusChange = async (taskId: string, status: Status) => {
    try {
      await tasksApi.update(taskId, { status })
      onRefresh()
    } catch {
      addToast(t('common.error'), 'error')
    }
  }

  return (
    <div className="border border-stone-200 dark:border-stone-800 rounded-lg mb-3">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}>
          <IChevron />
        </span>
        <span className="font-medium text-[13px]">{sprint.name}</span>
        <span className="text-[11px] text-stone-400">{formatDateRange(sprint.start_date, sprint.end_date)}</span>
        <span className={`ml-auto text-[11px] font-medium ${overCapacity ? 'text-red-500' : 'text-stone-500'}`}>
          {sprint.capacity !== null
            ? t('sprints.effort_of', { used: sprint.total_effort, capacity: sprint.capacity }) + (effortUnit ? ` ${effortUnit}` : '')
            : effortUnit ? `${sprint.total_effort} ${effortUnit}` : sprint.total_effort}
        </span>
        {overCapacity && (
          <span className="text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
            {t('sprints.over_capacity')}
          </span>
        )}
        {isManager && (
          <button
            className="ml-2 text-[11px] text-stone-400 hover:text-red-500"
            onClick={(e) => { e.stopPropagation(); setDeleting(true) }}
          >
            ×
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="border-t border-stone-100 dark:border-stone-800">
          {tasks.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-stone-400">{t('tasks.empty')}</div>
          ) : (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                effortUnit={effortUnit}
                statuses={statuses}
                onStatusChange={(s) => handleStatusChange(task.id, s)}
              />
            ))
          )}
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          message={`Delete sprint "${sprint.name}"? Tasks will become unassigned.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(false)}
        />
      )}
    </div>
  )
}

function TaskRow({
  task,
  effortUnit,
  statuses,
  onStatusChange,
}: {
  task: TaskResponse
  effortUnit: string | null
  statuses: { slug: string; name: string; colour: string }[]
  onStatusChange: (s: Status) => void
}) {
  const href = task.story_id ? `/stories/${task.story_id}/tasks/${task.id}` : `/tasks/${task.id}`
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-t border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900/50">
      <PriorityBars priority={task.priority} />
      <a href={href} className="flex-1 text-[13px] truncate hover:underline">{task.title}</a>
      {task.effort !== null && effortUnit && (
        <span className="text-[11px] text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded">
          {task.effort} {effortUnit}
        </span>
      )}
      <StatusPill status={task.status} statuses={statuses} />
    </div>
  )
}

export function SprintView({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { isManager } = useRole(projectId)
  const { sprints, loading, refresh } = useProjectSprints(projectId)
  const { statuses } = useProjectStatuses(projectId)
  const { addToast } = useToast()

  const [allTasks, setAllTasks] = useState<TaskResponse[]>([])
  const [project, setProject] = useState<{ effort_unit: string | null }>({ effort_unit: null })
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newCapacity, setNewCapacity] = useState('')
  const [creating, setCreating] = useState(false)

  const loadData = useCallback(async () => {
    const [tasksResp, projResp] = await Promise.all([
      tasksApi.listForProject(projectId, { limit: 100 }),
      projectsApi.get(projectId),
    ])
    setAllTasks(tasksResp.data.items)
    setProject({ effort_unit: projResp.data.effort_unit ?? null })
  }, [projectId])

  useEffect(() => { loadData() }, [loadData])

  const handleCreateSprint = async () => {
    if (!newName || !newStart || !newEnd) return
    setCreating(true)
    try {
      await sprintsApi.create(projectId, {
        name: newName,
        start_date: newStart,
        end_date: newEnd,
        capacity: newCapacity ? parseInt(newCapacity) : null,
      })
      setShowCreate(false)
      setNewName(''); setNewStart(''); setNewEnd(''); setNewCapacity('')
      refresh()
    } catch {
      addToast(t('common.error'), 'error')
    }
    setCreating(false)
  }

  const tasksBySprint = (sprintId: string) =>
    allTasks.filter((t) => t.sprint_id === sprintId)
  const unassigned = allTasks.filter((t) => !t.sprint_id)

  if (loading) return <div className="p-6 text-[13px] text-stone-400">Loading…</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold">{t('sprints.title')}</h2>
        {isManager && (
          <button className="btn-primary text-[12px] flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <IPlus /> {t('sprints.create')}
          </button>
        )}
      </div>

      {sprints.length === 0 && !showCreate && (
        <EmptyState message={t('sprints.empty')} />
      )}

      {sprints.map((sprint) => (
        <SprintCard
          key={sprint.id}
          sprint={sprint}
          tasks={tasksBySprint(sprint.id)}
          projectId={projectId}
          effortUnit={project.effort_unit}
          statuses={statuses}
          isManager={isManager}
          onRefresh={refresh}
        />
      ))}

      {unassigned.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[12px] font-medium text-stone-400 uppercase tracking-wider mb-2">
            {t('sprints.unassigned')}
          </h3>
          {unassigned.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              effortUnit={project.effort_unit}
              statuses={statuses}
              onStatusChange={async (s) => { await tasksApi.update(task.id, { status: s }); refresh() }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-stone-900 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-[14px] font-semibold mb-4">{t('sprints.create')}</h3>
            <div className="space-y-3">
              <input
                className="input w-full"
                placeholder={t('sprints.name')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  className="input"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                />
                <input
                  type="date"
                  className="input"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                />
              </div>
              <input
                type="number"
                className="input w-full"
                placeholder={t('sprints.capacity_optional')}
                value={newCapacity}
                onChange={(e) => setNewCapacity(e.target.value)}
              />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button className="btn-ghost text-[12px]" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="btn-primary text-[12px]" onClick={handleCreateSprint} disabled={creating}>
                {creating ? 'Creating…' : t('sprints.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Check TypeScript compiles**

```bash
cd frontend
npm run lint
```

Expected: no errors (fix any type issues shown).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SprintView.tsx frontend/src/pages/ProjectDetailPage.tsx frontend/src/locales/en-GB.json frontend/src/locales/pl.json
git commit -m "feat: add SprintView page and Sprints tab in ProjectDetailPage"
```

---

## Task 7: TimelineView page

**Files:**
- Create: `frontend/src/pages/TimelineView.tsx`

- [ ] **Step 1: Create TimelineView component**

```tsx
// frontend/src/pages/TimelineView.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { timelineApi, projectsApi } from '../services/api'
import type { TimelineTask, Priority } from '../services/api'
import { EmptyState } from '../components/common/EmptyState'

const PRIORITY_COLOURS: Record<Priority, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#ef4444',
}

const ROW_HEIGHT = 32  // px per task row
const LEFT_COL = 220   // px for title column
const DAY_WIDTH = 24   // px per day

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00')
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface PlacedTask {
  task: TimelineTask
  row: number
  startPx: number
  widthPx: number
}

function assignRows(tasks: TimelineTask[], rangeStart: Date): PlacedTask[] {
  const placed: PlacedTask[] = []
  const rowEnds: number[] = []  // rightmost px used in each row

  for (const task of tasks) {
    const startPx = daysBetween(rangeStart, parseDate(task.bar_start)) * DAY_WIDTH
    const endPx = daysBetween(rangeStart, parseDate(task.bar_end)) * DAY_WIDTH
    const widthPx = Math.max(endPx - startPx, DAY_WIDTH)

    let row = rowEnds.findIndex((end) => end <= startPx)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = startPx + widthPx + 4

    placed.push({ task, row, startPx, widthPx })
  }
  return placed
}

interface Group {
  label: string
  tasks: TimelineTask[]
}

function buildGroups(items: TimelineTask[], sprints: Map<string, string>): Group[] {
  const bySprintId = new Map<string | null, TimelineTask[]>()
  for (const item of items) {
    const key = item.sprint_id
    if (!bySprintId.has(key)) bySprintId.set(key, [])
    bySprintId.get(key)!.push(item)
  }
  const groups: Group[] = []
  for (const [sprintId, tasks] of bySprintId) {
    if (sprintId !== null) {
      groups.push({ label: sprints.get(sprintId) ?? 'Sprint', tasks })
    }
  }
  const unassigned = bySprintId.get(null)
  if (unassigned) groups.push({ label: 'Unassigned', tasks: unassigned })
  return groups
}

function Tooltip({ task, unit }: { task: TimelineTask; unit: string }) {
  const { t } = useTranslation()
  const sourceLabel = {
    deadline: t('timeline.source_deadline'),
    sprint: t('timeline.source_sprint'),
    status_history: t('timeline.source_history'),
  }[task.source]
  return (
    <div className="absolute z-50 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[11px] rounded-lg px-3 py-2 shadow-xl pointer-events-none -translate-y-full -mt-1 whitespace-nowrap">
      <div className="font-medium mb-0.5">{task.title}</div>
      <div className="text-stone-300 dark:text-stone-600">{task.status} · {task.priority}</div>
      {task.effort !== null && <div>{task.effort} {unit}</div>}
      <div className="mt-0.5">{sourceLabel}</div>
    </div>
  )
}

export function TimelineView({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<TimelineTask[]>([])
  const [loading, setLoading] = useState(true)
  const [effortUnit, setEffortUnit] = useState('sp')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tlResp, projResp] = await Promise.all([
        timelineApi.get(projectId),
        projectsApi.get(projectId),
      ])
      setItems(tlResp.data)
      setEffortUnit(projResp.data.effort_unit ?? 'sp')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (items.length === 0) return { rangeStart: new Date(), rangeEnd: new Date(), totalDays: 30 }
    const starts = items.map(i => parseDate(i.bar_start))
    const ends = items.map(i => parseDate(i.bar_end))
    const minD = new Date(Math.min(...starts.map(d => d.getTime())))
    const maxD = new Date(Math.max(...ends.map(d => d.getTime())))
    minD.setDate(minD.getDate() - 7)
    maxD.setDate(maxD.getDate() + 7)
    return { rangeStart: minD, rangeEnd: maxD, totalDays: daysBetween(minD, maxD) }
  }, [items])

  // Build axis tick dates (weekly)
  const axisTicks: Date[] = useMemo(() => {
    const ticks: Date[] = []
    const d = new Date(rangeStart)
    while (d <= rangeEnd) {
      ticks.push(new Date(d))
      d.setDate(d.getDate() + 7)
    }
    return ticks
  }, [rangeStart, rangeEnd])

  // Build groups (sprint labels from items)
  const sprintNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const item of items) {
      if (item.sprint_id) m.set(item.sprint_id, `Sprint`)  // name not in timeline response; label by sprint_id grouping
    }
    return m
  }, [items])

  const groups = useMemo(() => buildGroups(items, sprintNames), [items, sprintNames])

  if (loading) return <div className="p-6 text-[13px] text-stone-400">Loading…</div>
  if (items.length === 0) return <EmptyState message={t('timeline.empty')} />

  const canvasWidth = totalDays * DAY_WIDTH

  return (
    <div className="p-6">
      <h2 className="text-[15px] font-semibold mb-4">{t('timeline.title')}</h2>
      <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-lg">
        <div style={{ minWidth: LEFT_COL + canvasWidth }}>
          {/* Date axis */}
          <div className="flex border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900">
            <div style={{ width: LEFT_COL }} className="shrink-0 px-3 py-2 text-[10px] font-medium text-stone-400 uppercase tracking-wider">
              Task
            </div>
            <div className="relative" style={{ width: canvasWidth, height: 28 }}>
              {axisTicks.map((tick, i) => (
                <span
                  key={i}
                  className="absolute top-1.5 text-[10px] text-stone-400"
                  style={{ left: daysBetween(rangeStart, tick) * DAY_WIDTH }}
                >
                  {formatDay(tick)}
                </span>
              ))}
            </div>
          </div>

          {/* Groups */}
          {groups.map((group, gi) => {
            const placed = assignRows(group.tasks, rangeStart)
            const rowCount = placed.reduce((m, p) => Math.max(m, p.row + 1), 1)
            const groupHeight = rowCount * ROW_HEIGHT

            return (
              <div key={gi} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                {/* Group label */}
                <div className="flex items-center bg-stone-50/50 dark:bg-stone-900/50 px-3 py-1.5 border-b border-stone-100 dark:border-stone-800">
                  <span className="text-[10.5px] font-semibold text-stone-500 uppercase tracking-wider" style={{ width: LEFT_COL - 12 }}>
                    {group.label}
                  </span>
                </div>

                {/* Rows */}
                <div className="flex">
                  {/* Title column */}
                  <div style={{ width: LEFT_COL }} className="shrink-0 border-r border-stone-100 dark:border-stone-800">
                    {placed.map(({ task, row }) => (
                      <div
                        key={task.task_id}
                        className="flex items-center gap-2 px-3 text-[12px] truncate"
                        style={{ height: ROW_HEIGHT, marginTop: row > 0 ? 0 : undefined }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: PRIORITY_COLOURS[task.priority] }}
                        />
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>

                  {/* Bar canvas */}
                  <div className="relative" style={{ width: canvasWidth, height: groupHeight }}>
                    {placed.map(({ task, row, startPx, widthPx }) => (
                      <div
                        key={task.task_id}
                        className="absolute flex items-center cursor-default"
                        style={{ left: startPx, top: row * ROW_HEIGHT + 6, height: ROW_HEIGHT - 12 }}
                        onMouseEnter={() => setHoveredId(task.task_id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div
                          className={`h-full rounded ${task.source === 'status_history' ? 'border-2 border-dashed' : ''}`}
                          style={{
                            width: widthPx,
                            backgroundColor: PRIORITY_COLOURS[task.priority] + '33',
                            borderColor: task.source === 'status_history' ? PRIORITY_COLOURS[task.priority] : undefined,
                          }}
                        />
                        {hoveredId === task.task_id && (
                          <div className="relative">
                            <Tooltip task={task} unit={effortUnit} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/TimelineView.tsx
git commit -m "feat: add TimelineView Gantt chart with overlap stacking and priority colours"
```

---

## Task 8: Effort config in Project Settings (ConfigPage)

**Files:**
- Modify: `frontend/src/pages/ConfigPage.tsx`

- [ ] **Step 1: Add effort config section**

In `frontend/src/pages/ConfigPage.tsx`, find where the project settings are rendered (the section that shows `ProjectStatusManager`). Add an effort config section below it.

First, add state variables in the `ConfigPage` function body:

```typescript
const [effortEnabled, setEffortEnabled] = useState(false)
const [effortUnit, setEffortUnit] = useState('sp')
const [savingEffort, setSavingEffort] = useState(false)
```

Load the project's current effort_unit when `selectedProjectId` changes (add alongside existing project load logic):

```typescript
useEffect(() => {
  if (!selectedProjectId) return
  projectsApi.get(selectedProjectId).then((r) => {
    const unit = r.data.effort_unit
    setEffortEnabled(!!unit)
    setEffortUnit(unit ?? 'sp')
  })
}, [selectedProjectId])
```

Add save handler:

```typescript
const handleSaveEffortUnit = async () => {
  if (!selectedProjectId) return
  setSavingEffort(true)
  try {
    await projectsApi.update(selectedProjectId, {
      effort_unit: effortEnabled ? (effortUnit || 'sp') : null,
    })
  } finally {
    setSavingEffort(false)
  }
}
```

Add the effort config section in the project settings tab content (right after the `ProjectStatusManager` section):

```tsx
<div className="mt-6 pt-6 border-t border-stone-200 dark:border-stone-800">
  <h3 className="text-[12px] font-semibold text-stone-500 uppercase tracking-wider mb-3">
    {t('effort.unit_label')}
  </h3>
  <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={effortEnabled}
      onChange={(e) => setEffortEnabled(e.target.checked)}
      className="accent-[var(--accent)]"
    />
    <span className="text-[13px]">{t('effort.enable')}</span>
  </label>
  {effortEnabled && (
    <div className="flex gap-2 items-center">
      <input
        className="input text-[13px] w-32"
        value={effortUnit}
        onChange={(e) => setEffortUnit(e.target.value)}
        placeholder="sp"
        maxLength={20}
      />
      <button
        className="btn-primary text-[12px]"
        onClick={handleSaveEffortUnit}
        disabled={savingEffort}
      >
        {savingEffort ? 'Saving…' : 'Save'}
      </button>
    </div>
  )}
  {!effortEnabled && (
    <button
      className="btn-ghost text-[12px]"
      onClick={handleSaveEffortUnit}
      disabled={savingEffort}
    >
      {savingEffort ? 'Saving…' : 'Disable'}
    </button>
  )}
</div>
```

- [ ] **Step 2: Lint check**

```bash
cd frontend
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ConfigPage.tsx
git commit -m "feat: add effort unit config in Project Settings tab"
```

---

## Task 9: Verification

- [ ] **Step 1: Run backend tests**

```bash
cd backend
uv run pytest -v
```

Expected: all tests pass.

- [ ] **Step 2: Run backend linting**

```bash
cd backend
uv run ruff check . && uv run ruff format .
```

Expected: no errors.

- [ ] **Step 3: Run frontend linting**

```bash
cd frontend
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test (requires running servers)**

Start backend: `cd backend && uv run python -m app.main`  
Start frontend: `cd frontend && npm run dev`

Test checklist:
- [ ] Create a project, go to Project Settings → enable effort tracking with unit "sp"
- [ ] Create a sprint with capacity 20
- [ ] Create tasks, set effort values, assign to sprint → verify over-capacity badge appears at 21+ sp
- [ ] Go to Sprints tab → verify sprint card shows tasks and effort totals
- [ ] Set due_date on a task via API (`PATCH /api/v1/tasks/{id}`) → verify it appears on Timeline tab
- [ ] Go to Timeline tab → verify bars render with correct colours and groups
- [ ] Verify tasks with no due_date, no sprint, and no status transitions are absent from Timeline
- [ ] Delete a sprint → verify its tasks move to Unassigned section

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -p  # stage only intended fixes
git commit -m "fix: resolve issues found in manual smoke test"
```
