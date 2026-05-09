# Admin Panel Design Spec

**Date:** 2026-05-09

## Context

The app has no admin/superuser concept. The owner wants a read-only analytics dashboard
to monitor aggregate usage without exposing user personal data.

## Auth & Session

Three env vars: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SECRET`.

- `POST /admin/login` verifies against env vars, sets an HTTP-only signed session cookie
  via Starlette `SessionMiddleware` storing `{"admin": true}`
- All admin routes redirect unauthenticated requests to `/admin/login`
- `POST /admin/logout` clears the session
- Admin identity never touches the users table

## Backend Structure

New module `backend/app/admin/` with router, auth helpers, services, and Jinja2 templates.
Registered in `backend/app/api/main.py` with prefix `/admin`.
No new Python dependencies beyond jinja2, python-multipart, and itsdangerous.

## Data Model Change

Add `last_login: datetime | None` to the `users` table (nullable, updated on each login).
Requires an Alembic migration.

## Stats

- **Totals:** total users, projects, stories, tasks + system-wide last login timestamp
- **Trends:** new entities per week for last 52 weeks via `GROUP BY date_trunc('week', created_at)`

No user emails, names, or personal data exposed — purely counts and timestamps.

## Dashboard Layout

- Top: 4 stat cards (Users, Projects, Stories, Tasks)
- Below: "Last login: YYYY-MM-DD HH:MM UTC"
- Main: 2×2 grid of Chart.js bar charts (one per entity type, 52-week x-axis)
- Nav bar with "Log out" button
- Plain CSS, no framework; Chart.js 4 via CDN
