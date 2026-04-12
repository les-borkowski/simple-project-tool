# Phase 3: API Layer

**Duration estimate**: 3–5 days  
**Reference**: `implementation-api.md`  
**Blocked by**: Phases 1 + 2 (needs DB + Auth)

### Scope

- Implement FastAPI app factory with CORS, Accept-Language middleware, exception handlers
- Implement cursor-based pagination helper
- Implement 8 service modules with full business logic
- Implement 8 route modules with thin HTTP handlers
- Implement 10 schema modules (Pydantic request/response models)
- Load locale JSON files and implement error message localization
- Implement status change tracking (StatusHistory records on every status update)
- Implement time tracking queries (time per status, elapsed time)
- Implement API key scope enforcement
- Handle password reset flow (token → confirm)

### Key Deliverables

1. **`backend/app/api/main.py`** — FastAPI app factory
   - CORS middleware
   - Accept-Language → request.state.locale
   - Exception handlers (422, 401, 403, 404, 500)
   - Load locale JSON files on startup
   - Startup event: `check_db_connection()`
   - Mount all routers under `/api/v1`

2. **`backend/app/api/schemas/`** — 10 Pydantic model files
   - `common.py` — PaginatedResponse, ErrorResponse
   - `user.py`, `project.py`, `story.py`, `task.py`, `comment.py`
   - `invitation.py`, `status_history.py`, `api_key.py`, `config.py`
   - Each has Create, Update, Response variants (where applicable)

3. **`backend/app/api/services/`** — 8 service modules
   - `auth_service.py` — register, login, refresh, password reset
   - `project_service.py` — CRUD, archive/restore, members, permissions
   - `story_service.py` — CRUD, move between projects
   - `task_service.py` — CRUD, assign/unassign
   - `comment_service.py` — create, update (own only), delete (own or manager)
   - `invitation_service.py` — invite, accept, decline, expire
   - `time_tracking_service.py` — record status changes, compute metrics
   - `config_service.py` — get/update user config, manage API keys

4. **`backend/app/api/routes/`** — 8 route modules
   - One router per domain (auth, projects, stories, tasks, comments, invitations, time_tracking, config)
   - Routes call services; never query DB directly
   - All routes return standard error shape: `{"error": {"code": "...", "message": "...", "details": [...]}}`
   - Cursor pagination on list endpoints

5. **`backend/app/locales/`** — Locale JSON files
   - `en-GB.json` — English error messages, status/priority strings
   - `pl.json` — Polish translations (full i18n)

### Testing Milestone

All checks in `implementation-api.md` section 8 must pass:
- [ ] POST /auth/register with duplicate email → 409
- [ ] POST /auth/login with wrong password → 401
- [ ] Login returns both access + refresh tokens
- [ ] GET /projects without auth → 401
- [ ] POST /projects as Contributor → 403
- [ ] PATCH /projects/{id} status change → StatusHistory record created
- [ ] PATCH semantics: only non-null fields modified
- [ ] Cursor pagination: limit=2 → next_cursor present, next page correct
- [ ] Accept-Language: pl header → Polish error messages
- [ ] API key with read:tasks → GET succeeds, PATCH → 403
- [ ] GET /docs returns Swagger UI
- [ ] CORS preflight returns correct headers
- [ ] Time metrics return correct elapsed seconds
- [ ] Invitations have expires_at = now + 7 days
- [ ] Accept invitation after expiry → 400
- [ ] All errors: `{"error": {"code": ..., "message": ..., "details": [...]}}`

### Gate Criteria to Phase 4

✅ **Must be complete**:
- `uv run python -m app.main` starts server on localhost:8000
- `GET /api/v1/docs` shows Swagger UI with all routes
- Test suite runs: `uv run pytest tests/test_api/ -v` (all API tests pass)
- Can register user → login → get access token
- Can create project as Manager, fails as Contributor
- Can list projects with pagination
- Database migrations applied: `alembic upgrade head`
- Neon connection (if using cloud) verified with sslmode=require
- Error responses all follow standard shape
- Phase Completion Protocol followed: changes committed + `claude --agent documentation-keeper` run
