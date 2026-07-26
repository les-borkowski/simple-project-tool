# Admin Panel — User Management Features

## Context

The admin panel (`/admin`) is a server-rendered Jinja2 app with session-based auth. It provides a dashboard with aggregate stats but no user management capabilities. This spec adds Create, Verify, Block/Unblock, Delete, and Reset Password actions for user accounts.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Location | Extend Jinja2 admin panel | Consistent with existing admin infrastructure |
| Account creation | Auto-verified (`email_confirmed=True`) | Admin vouches for the account |
| Password reset | Send reset email to user | User sets their own password; admin never knows it |
| Deletion | Hard delete | Cascades to UserConfig, APIKey, ProjectMember |
| Code structure | Separate `users_router.py` + `users_service.py` | Mirrors the API layer pattern |

## Data Model

One new field on `User`:

```python
is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
```

No other schema changes. Verification uses the existing `email_confirmed` field.

## Auth Behaviour

- **Login** (`auth_service.login`): reject blocked users with `403 ACCOUNT_BLOCKED`
- **Token refresh** (`auth_service.refresh_token_fn`): same check
- **Per-request auth** (`dependencies.get_current_user`): same check — existing JWTs are invalidated immediately when a user is blocked

## API Routes (Admin)

| Method | Path | Action |
|--------|------|--------|
| GET | `/admin/users` | List all users |
| GET | `/admin/users/new` | Create form |
| POST | `/admin/users` | Create user (auto-verified) |
| POST | `/admin/users/{id}/verify` | Mark email confirmed |
| POST | `/admin/users/{id}/block` | Set `is_blocked=True` |
| POST | `/admin/users/{id}/unblock` | Set `is_blocked=False` |
| POST | `/admin/users/{id}/reset-password` | Send reset email |
| POST | `/admin/users/{id}/delete` | Hard delete |

All POST actions use Post-Redirect-Get with session flash messages.

## Templates

- `admin/templates/users/list.html` — table with status badges + inline action forms per row
- `admin/templates/users/create.html` — Name, Email, Password, Role form
- `admin/templates/layout.html` — updated with "Users" nav link + flash message block

## Files Modified / Created

| Action | Path |
|--------|------|
| Modified | `backend/app/db/models/user.py` |
| New | `backend/alembic/versions/*_add_is_blocked_to_users.py` |
| Modified | `backend/app/api/services/auth_service.py` |
| Modified | `backend/app/auth/dependencies.py` |
| New | `backend/app/admin/users_router.py` |
| New | `backend/app/admin/users_service.py` |
| New | `backend/app/admin/templates/users/list.html` |
| New | `backend/app/admin/templates/users/create.html` |
| Modified | `backend/app/admin/templates/layout.html` |
| Modified | `backend/app/admin/router.py` |
| Modified | `backend/tests/test_admin.py` |
