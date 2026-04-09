# Implementation Plan: API Layer

**Module**: `backend/app/api/`
**Depends on**: DB layer + Auth layer
**Used by**: Frontend (UI), CLI (via HTTP), any external integrations

---

## Overview

The API layer exposes the REST API under `/api/v1`. It is composed of three sub-layers:
- **Schemas** (Pydantic v2) — validate request bodies and shape response data
- **Services** — business logic; the only place that reads/writes the DB and enforces permissions
- **Routes** — thin HTTP handlers; parse request, call service, return response

Routes never query the DB directly. Services never know about HTTP.

---

## 1. Files

```
backend/app/api/
├── __init__.py
├── main.py                    # FastAPI app factory + middleware
├── schemas/
│   ├── __init__.py
│   ├── common.py              # PaginatedResponse, ErrorResponse
│   ├── user.py
│   ├── project.py
│   ├── story.py
│   ├── task.py
│   ├── comment.py
│   ├── invitation.py
│   ├── status_history.py
│   ├── config.py              # UserConfig schemas
│   └── api_key.py
├── services/
│   ├── __init__.py
│   ├── auth_service.py
│   ├── project_service.py
│   ├── story_service.py
│   ├── task_service.py
│   ├── comment_service.py
│   ├── invitation_service.py
│   ├── time_tracking_service.py
│   └── config_service.py
└── routes/
    ├── __init__.py
    ├── auth.py
    ├── projects.py
    ├── stories.py
    ├── tasks.py
    ├── comments.py
    ├── invitations.py
    ├── time_tracking.py
    └── config.py

backend/app/locales/
├── en-GB.json
└── pl.json
```

---

## 2. `main.py` — App Factory

Tasks:
1. Create `FastAPI(title="simple-project-tool", version="1.0", docs_url="/docs", redoc_url="/redoc")`
2. Add `CORSMiddleware`:
   - `allow_origins = settings.CORS_ORIGINS` (from env)
   - `allow_credentials = True`
   - `allow_methods = ["*"]`
   - `allow_headers = ["*"]`
3. Add custom `Accept-Language` middleware:
   - Extract `Accept-Language` header from request
   - Parse primary locale tag (e.g. `"pl"` → `"pl"`, `"en-GB"` → `"en-GB"`)
   - Normalise to supported locale or fall back to `"en-GB"`
   - Attach to `request.state.locale`
4. Add global exception handlers:
   - `RequestValidationError` → 422 with standard error shape
   - `HTTPException` → pass-through with standard error shape
   - `Exception` → 500 with generic error shape
5. Load locale JSON files on startup (store in `app.state.locales` dict)
6. Mount all routers under `/api/v1` prefix
7. Add startup event: call `check_db_connection()`

### Standard error response shape
All errors must return:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable, localised message",
    "details": [{"field": "name", "issue": "required"}]
  }
}
```
`code` values: `VALIDATION_ERROR`, `AUTH_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`

### i18n for error messages
```python
def t(key: str, locale: str, **kwargs) -> str:
    messages = app.state.locales.get(locale, app.state.locales["en-GB"])
    template = messages.get(key, key)     # fallback to key itself
    return template.format(**kwargs) if kwargs else template
```
Locale JSON keys example (`en-GB.json`):
```json
{
  "error.not_found": "Not found",
  "error.forbidden": "You do not have permission to perform this action",
  "error.email_taken": "That email address is already registered",
  "error.invalid_credentials": "Invalid email or password",
  "error.invitation_expired": "This invitation has expired"
}
```

---

## 3. Schemas (`schemas/`)

### 3.1 `common.py`
```python
class PaginatedResponse(BaseModel, Generic[T]):
    data: list[T]
    next_cursor: str | None    # UUID of last item, None if no more pages
    limit: int

class ErrorDetail(BaseModel):
    field: str | None = None
    issue: str

class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = []

class ErrorResponse(BaseModel):
    error: ErrorBody
```

### 3.2 Per-entity schema pattern
For each entity define three classes:

**Example: `project.py`**
```python
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    priority: PriorityEnum = PriorityEnum.medium

class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    status: StatusEnum | None = None
    priority: PriorityEnum | None = None

class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None
    owner_id: UUID
    status: StatusEnum
    priority: PriorityEnum
    archived_at: datetime | None
    created_by: UUID
    updated_by: UUID | None
    created_at: datetime
    updated_at: datetime
```

Apply same pattern to: User, Story, Task, Comment, Invitation, StatusHistory, APIKey, UserConfig.

**Important**: `*Response` schemas must never include `password_hash` or `key_hash`.

**APIKey special case**: `APIKeyCreateResponse` includes a `key` field (raw key, shown once). `APIKeyResponse` (for list) does not.

---

## 4. Cursor-Based Pagination

### 4.1 How keyset pagination works
Items are sorted by `(created_at DESC, id DESC)`. The cursor encodes the last item's `(created_at, id)`. The next page query adds a WHERE clause:
```sql
WHERE (created_at, id) < (:cursor_created_at, :cursor_id)
```

### 4.2 Cursor encoding
Encode as a base64 JSON string: `base64(json({"ts": "2026-04-09T...", "id": "uuid"}))`.
Decode on input; return encoded `next_cursor` in response (or `null` if fewer items than limit were returned).

### 4.3 Helper function
```python
async def paginate(
    stmt: Select,
    cursor: str | None,
    limit: int,
    db: AsyncSession,
    response_schema: type[BaseModel],
) -> PaginatedResponse:
    # 1. Apply cursor WHERE clause if cursor provided
    # 2. ORDER BY created_at DESC, id DESC
    # 3. LIMIT limit + 1 (fetch one extra to detect next page)
    # 4. If len(results) > limit: has_more=True, next_cursor = encode(results[limit-1])
    # 5. Return PaginatedResponse(data=results[:limit], next_cursor=..., limit=limit)
```

Default limit: 25. Maximum limit: 100. Validate in route (clamp if > 100).

---

## 5. Services

### 5.1 `auth_service.py`
```
register(email, name, password, db) -> User
  - Check email uniqueness (409 CONFLICT if taken)
  - hash_password(password)
  - Create User
  - Create UserConfig with locale=en-GB, theme=system
  - db.commit()

login(email, password, db) -> dict
  - Get user by email (401 if not found)
  - verify_password (401 if wrong)
  - Return {"access_token": ..., "refresh_token": ..., "token_type": "bearer"}

refresh_token(refresh_token_str, db) -> str
  - decode_token → verify type=="refresh"
  - Load user from DB
  - Return new access_token

request_password_reset(email, db) -> None
  - Find user by email (no-op if not found — don't leak)
  - create_password_reset_token → log to stdout

confirm_password_reset(token, new_password, db) -> None
  - verify_password_reset_token → user_id
  - hash new password, update User
```

### 5.2 `project_service.py`
```
list_projects(user, status, priority, archived, q, cursor, limit, db) -> PaginatedResponse
  - Base query: projects where user is owner OR has ProjectMember record
  - Apply filters: status, priority, archived (None=active only), text search on name/description
  - Call paginate()

create_project(user, data, db) -> Project
  - require_manager(user.role)  [global role — not project-specific]
  - Create Project with owner_id=user.id, created_by=user.id
  - db.commit()

get_project(user, project_id, db) -> Project
  - require_project_access(user, project_id, db)

update_project(user, project_id, data, db) -> Project
  - role = require_project_access(...)
  - Apply only non-None fields from data (PATCH semantics)
  - If data.status changed: call time_tracking_service.record_status_change(...)
  - Set updated_by = user.id
  - db.commit()

delete_project(user, project_id, db) -> None
  - role = require_project_access(...)
  - require_manager(role)
  - db.delete(project); db.commit()

archive_project(user, project_id, db) -> Project
  - role = require_project_access(...)
  - require_manager(role)
  - project.archived_at = datetime.utcnow()

restore_project(user, project_id, db) -> Project
  - Similar; project.archived_at = None

add_member(user, project_id, invitee_user_id, role, db) -> ProjectMember
  - require_manager for caller's role on project
  - Create ProjectMember; joined_at = now

update_member_role(user, project_id, target_user_id, new_role, db) -> ProjectMember
  - require_manager
  - Update ProjectMember.role

remove_member(user, project_id, target_user_id, db) -> None
  - require_manager
  - Cannot remove the project owner
  - db.delete(member)
```

### 5.3 `story_service.py`
Same CRUD pattern as projects. Additional:
```
move_story(user, story_id, target_project_id, db) -> Story
  - Verify user has access to both source and target projects
  - require_manager on source project
  - story.project_id = target_project_id
```

### 5.4 `task_service.py`
Same CRUD pattern. Additional:
```
assign_task(user, task_id, assignee_id, db) -> Task
  - Verify assignee is a member of the task's project
  - task.assignee_id = assignee_id (or None for unassign)
```

### 5.5 `comment_service.py`
```
create_comment(user, item_type, item_id, body, db) -> Comment
  - Verify user has access to the parent item's project
  - Set the correct FK column (project_id, story_id, or task_id)
  - author_id = user.id

update_comment(user, comment_id, body, db) -> Comment
  - Load comment; verify comment.author_id == user.id (403 otherwise)
  - comment.body = body

delete_comment(user, comment_id, db) -> None
  - Load comment
  - Allow if: comment.author_id == user.id OR user is Manager on the item's project
  - db.delete(comment)
```

### 5.6 `invitation_service.py`
```
invite(user, project_id, invitee_email, role, db) -> Invitation
  - role = require_project_access(user, project_id) → require_manager
  - Check no existing pending invitation for same email+project
  - expires_at = datetime.utcnow() + timedelta(days=7)
  - Create Invitation(status=pending)

accept(user, invitation_id, db) -> ProjectMember
  - Load Invitation; verify invitee_email matches user.email (or use token-based acceptance)
  - Check status==pending; check expires_at > now (set status=expired if not)
  - Create ProjectMember(role=invitation.role, joined_at=now)
  - invitation.status = accepted

decline(user, invitation_id, db) -> None
  - invitation.status = declined

cancel(user, invitation_id, db) -> None
  - require_manager on invitation's project
  - invitation.status = expired

expire_stale_invitations(db) -> int
  - UPDATE invitations SET status='expired'
    WHERE status='pending' AND expires_at < now()
  - Return count updated (call from a scheduled task or on each relevant request)

list_my_invitations(user, db) -> list[Invitation]
  - WHERE invitee_email = user.email AND status = 'pending'
```

### 5.7 `time_tracking_service.py`
```
record_status_change(item_type, item_fk_field, item_id, from_status, to_status, changed_by_id, db)
  - Create StatusHistory row with the correct FK set
  - item_type determines which FK column (project_id, story_id, or task_id)
  - changed_at = datetime.utcnow()
  - NOTE: called inside the same DB transaction as the status update

get_status_history(item_type, item_id, db) -> list[StatusHistory]
  - Filter by the correct FK column
  - ORDER BY changed_at ASC

get_time_metrics(item_type, item_id, db) -> dict
  history = get_status_history(...)
  metrics = {}                             # status → total_seconds
  for i, record in enumerate(history):
      end_time = history[i+1].changed_at if i+1 < len(history) else datetime.utcnow()
      elapsed = (end_time - record.changed_at).total_seconds()
      metrics[record.to_status] = metrics.get(record.to_status, 0) + elapsed
  return {
    "time_per_status": {status: seconds for status, seconds in metrics.items()},
    "total_elapsed_seconds": sum(metrics.values()),
    "current_status": history[-1].to_status if history else None,
  }

get_project_time_report(project_id, db) -> dict
  - Aggregate time_metrics for the project itself + all its stories + all tasks in those stories
  - Group by status across all items
  - Return {"project": {...}, "stories": [...], "tasks": [...], "summary": {...}}
```

### 5.8 `config_service.py`
```
get_config(user, db) -> UserConfig
  - db.get(UserConfig, user.id) or create default

update_config(user, data, db) -> UserConfig
  - Apply non-None fields from data

create_api_key(user, label, scopes, db) -> tuple[str, APIKey]
  - Validate scopes are all valid scope strings
  - raw_key, key_hash = generate_api_key()
  - Create APIKey(key_hash=key_hash, label=label, scopes=scopes)
  - Return (raw_key, api_key)  — raw_key returned to caller ONCE

list_api_keys(user, db) -> list[APIKey]
  - WHERE user_id=user.id AND revoked_at IS NULL

revoke_api_key(user, key_id, db) -> None
  - Load APIKey; verify user_id == user.id
  - api_key.revoked_at = datetime.utcnow()
```

---

## 6. Routes

### Pattern for every route file
```python
router = APIRouter(prefix="/projects", tags=["projects"])

@router.get("", response_model=PaginatedResponse[ProjectResponse])
async def list_projects(
    status: StatusEnum | None = None,
    priority: PriorityEnum | None = None,
    archived: bool = False,
    q: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=25, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user_or_api_key),
):
    return await project_service.list_projects(user, status, priority, archived, q, cursor, limit, db)
```

### Status-change side effect
Every PATCH route that can modify `.status` must call `record_status_change` inside the same transaction:
```python
if data.status and data.status != item.status:
    await time_tracking_service.record_status_change(
        item_type="task",
        item_fk_field="task_id",
        item_id=item.id,
        from_status=item.status,
        to_status=data.status,
        changed_by_id=user.id,
        db=db,
    )
```

### Route → service mapping

| Method | Path | Service call |
|--------|------|-------------|
| POST | /auth/register | auth_service.register |
| POST | /auth/login | auth_service.login |
| POST | /auth/refresh | auth_service.refresh_token |
| GET | /auth/me | return current user |
| POST | /auth/logout | clear (stateless v1) |
| POST | /auth/password-reset | auth_service.request_password_reset |
| POST | /auth/password-reset/confirm | auth_service.confirm_password_reset |
| GET | /projects | project_service.list_projects |
| POST | /projects | project_service.create_project |
| GET | /projects/{id} | project_service.get_project |
| PATCH | /projects/{id} | project_service.update_project |
| DELETE | /projects/{id} | project_service.delete_project |
| POST | /projects/{id}/archive | project_service.archive_project |
| POST | /projects/{id}/restore | project_service.restore_project |
| GET | /projects/{id}/members | project_service.list_members |
| POST | /projects/{id}/members | project_service.add_member |
| PATCH | /projects/{id}/members/{uid} | project_service.update_member_role |
| DELETE | /projects/{id}/members/{uid} | project_service.remove_member |
| GET | /projects/{id}/invitations | invitation_service.list_project_invitations |
| POST | /projects/{id}/invitations | invitation_service.invite |
| GET | /projects/{id}/status-history | time_tracking_service.get_status_history |
| GET | /projects/{id}/time-metrics | time_tracking_service.get_time_metrics |
| GET | /projects/{id}/time-report | time_tracking_service.get_project_time_report |
| GET | /projects/{id}/stories | story_service.list_stories |
| POST | /projects/{id}/stories | story_service.create_story |
| GET | /stories/{id} | story_service.get_story |
| PATCH | /stories/{id} | story_service.update_story + record_status_change |
| DELETE | /stories/{id} | story_service.delete_story |
| POST | /stories/{id}/move | story_service.move_story |
| GET | /stories/{id}/tasks | task_service.list_tasks |
| POST | /stories/{id}/tasks | task_service.create_task |
| GET | /tasks/{id} | task_service.get_task |
| PATCH | /tasks/{id} | task_service.update_task + record_status_change |
| DELETE | /tasks/{id} | task_service.delete_task |
| GET/POST | /projects/{id}/comments | comment_service |
| GET/POST | /stories/{id}/comments | comment_service |
| GET/POST | /tasks/{id}/comments | comment_service |
| PATCH | /comments/{id} | comment_service.update_comment |
| DELETE | /comments/{id} | comment_service.delete_comment |
| DELETE | /invitations/{id} | invitation_service.cancel |
| POST | /invitations/{id}/accept | invitation_service.accept |
| POST | /invitations/{id}/decline | invitation_service.decline |
| GET | /invitations/mine | invitation_service.list_my_invitations |
| GET | /stories/{id}/status-history | time_tracking_service |
| GET | /stories/{id}/time-metrics | time_tracking_service |
| GET | /tasks/{id}/status-history | time_tracking_service |
| GET | /tasks/{id}/time-metrics | time_tracking_service |
| GET | /users/{id}/time-report | time_tracking_service |
| GET | /config | config_service.get_config |
| PATCH | /config | config_service.update_config |
| GET | /config/api-keys | config_service.list_api_keys |
| POST | /config/api-keys | config_service.create_api_key |
| DELETE | /config/api-keys/{id} | config_service.revoke_api_key |
| GET | /config/locales | return static list of supported locales |

---

## 7. Locale JSON Files

### `backend/app/locales/en-GB.json`
```json
{
  "error.not_found": "Not found",
  "error.forbidden": "You do not have permission to perform this action",
  "error.email_taken": "That email address is already registered",
  "error.invalid_credentials": "Invalid email or password",
  "error.invitation_expired": "This invitation has expired",
  "error.invalid_scope": "Invalid API key scope: {scope}",
  "error.not_project_member": "You are not a member of this project",
  "error.manager_required": "This action requires Manager role",
  "error.cannot_remove_owner": "The project owner cannot be removed"
}
```

### `backend/app/locales/pl.json`
```json
{
  "error.not_found": "Nie znaleziono",
  "error.forbidden": "Nie masz uprawnień do wykonania tej czynności",
  "error.email_taken": "Ten adres e-mail jest już zarejestrowany",
  "error.invalid_credentials": "Nieprawidłowy adres e-mail lub hasło",
  "error.invitation_expired": "To zaproszenie wygasło",
  "error.invalid_scope": "Nieprawidłowy zakres klucza API: {scope}",
  "error.not_project_member": "Nie jesteś członkiem tego projektu",
  "error.manager_required": "Ta czynność wymaga roli Menedżera",
  "error.cannot_remove_owner": "Nie można usunąć właściciela projektu"
}
```

---

## 8. Testing Checklist

- [ ] `POST /api/v1/auth/register` with duplicate email → 409
- [ ] `POST /api/v1/auth/login` with wrong password → 401
- [ ] `POST /api/v1/auth/login` success → returns both tokens
- [ ] `GET /api/v1/projects` without auth → 401
- [ ] `POST /api/v1/projects` as Contributor → 403
- [ ] `PATCH /api/v1/projects/{id}` status change → StatusHistory record created
- [ ] `PATCH /api/v1/tasks/{id}` with non-null fields only changes those fields (PATCH semantics)
- [ ] Cursor pagination: GET /projects?limit=2 → `next_cursor` present; GET with cursor → next page starts correctly
- [ ] Accept-Language: pl header → error messages in Polish
- [ ] API key with `read:tasks` → `GET /tasks/{id}` succeeds; `PATCH /tasks/{id}` → 403
- [ ] `GET /docs` returns Swagger UI (FastAPI auto-docs working)
- [ ] CORS: preflight request returns correct headers
- [ ] `GET /tasks/{id}/time-metrics` returns correct elapsed seconds after status changes
- [ ] `POST /projects/{id}/invitations` → creates Invitation with expires_at = now + 7 days
- [ ] `POST /invitations/{id}/accept` after expiry → 400
- [ ] Error shape always: `{"error": {"code": ..., "message": ..., "details": [...]}}`
