# Write-latency & perceived-performance rework

## Context

Writes (create task, change status, edit story) feel slow **in the deployed app only** — frontend on Vercel, backend on Railway, DB on Neon `eu-west-2` (London). Local dev is fine.

> **Update — 2026-07-25, before implementation started.** The suspected region mismatch was confirmed: Railway was running in a **US region** while Neon sits in London. At ~140 ms per query × 8–10 sequential queries, that is **~1.4 s of pure network per write** — the reported slowness, almost in its entirety.
>
> **Railway has been migrated to Amsterdam** (Railway offers no London region; Amsterdam is ~8 ms away). Neon stays in London. Cause 1 below is therefore *resolved*, and this plan now starts from a co-located baseline. Phases are unchanged but their expected payoffs shift — see the notes marked **[Post-move]**.

The original proposal was a **server-side write-behind queue**: accept the write, return immediately, queue the DB write, coalesce repeat edits to the same item. The instinct — "don't make the user wait for the database" — is right, but the queue is in the wrong place:

- **It doesn't remove the wait.** A status change today costs *two sequential HTTP round trips* (`PATCH /tasks/:id` then a full `GET /stories/:id/tasks` refetch) with the UI painting nothing in between. Queueing the DB write server-side removes a fraction of one of those trips.
- **It breaks read-your-own-writes.** That follow-up `GET` would race the queue and return pre-write data.
- **It isn't durable.** Single uvicorn process on Railway; an in-memory queue loses accepted writes on every deploy. Making it durable means writing to a database first — the thing we were avoiding.
- **Coalescing corrupts the audit trail.** `status_history` is explicitly immutable and feeds time tracking. "Only the latest wins" deletes the intermediate transitions we pay to record.

The correct placement is **optimistic updates on the client** — the same idea, applied where it's safe. The codebase already does this correctly in three drag handlers; every other mutation falls back to `await mutate(); refresh()`.

**Three real causes, addressed in order:**
1. ~~Railway↔Neon region mismatch~~ — **RESOLVED** by the Amsterdam move above. A single task create still issues **8–10 sequential DB round trips**; at ~8 ms/query that is now ~80 ms rather than ~1.4 s. The trip count is still worth cutting, but it is no longer the emergency.
2. Frontend never paints optimistically and double-fetches. **This is now the dominant remaining cause.**
3. `bcrypt` (rounds=12) runs synchronously on the event loop, freezing all concurrent requests for ~300ms per login.

**Outcome:** writes paint at 0ms; deployed write latency drops from ~10 DB round trips to ~5; no new failure modes.

**[Post-move] Revised priority.** With the ocean crossing gone, the largest remaining win is **Phase 4** (optimistic UI), not Phase 3 — a status change still costs two sequential HTTP round trips with nothing painted in between, and that cost is unaffected by database proximity. Phase 3 is still worth doing and Phase 3.4 (bcrypt) remains a genuine correctness-of-concurrency fix, but if time is short, Phase 4 is where the user-visible change lives.

---

## Phase 1 — Measure (no behaviour change)

Nothing after this is worth doing blind. Goal: one number saying whether the problem is network RTT, query count, or event-loop blocking.

**[Post-move] The goal has shifted from *diagnose* to *confirm and re-baseline*.** The region cause is known and fixed, so Phase 1 now answers two narrower questions: did the Amsterdam move deliver what it should have (`db/q` should land near 8 ms, down from ~140 ms), and what is left once it has. Still do it first — the numbers it produces are what tell you whether Phase 3 is worth the effort, and without them you are guessing about your own infrastructure.

One caveat when measuring by hand: **`/health` does not touch the database** ([main.py:181-184](../../../backend/app/api/main.py)). It measures the browser→backend leg only. To see the DB hop, diff it against an endpoint that queries (`GET /api/v1/projects`, ~3–4 queries).

**New `backend/app/core/perf.py`** — SQLAlchemy `before_cursor_execute`/`after_cursor_execute` listeners on `engine.sync_engine`, accumulating count + duration into a `ContextVar` holding a *mutable list* (not an int — so it works regardless of whether `greenlet_spawn` copies the context).

**`backend/app/api/main.py`** — add `perf_middleware` *after* `locale_middleware` (~line 112) so it runs outermost. Emits:
```
Server-Timing: total;dur=..., db;dur=..., q;desc="N queries"
X-Query-Count: N
```
and logs a `SLOW` warning over 500ms.

Supporting edits:
- `backend/app/core/config.py`: `PERF_HEADERS: bool = False`. **Not** gated on `DEBUG` — we need this on in production temporarily.
- `main.py:96-101`: add `expose_headers=["Server-Timing", "X-Query-Count"]` to `CORSMiddleware`.
- Lifespan (~`main.py:60-76`): log `RAILWAY_REPLICA_REGION`, `RAILWAY_ENVIRONMENT`, and `urlparse(settings.DATABASE_URL).hostname` at startup — makes region co-location visible in logs instead of dashboard archaeology.

### Decision thresholds

Let `q` = query count, `db` = DB time, `total` = server time, `wall` = curl `time_total`.

| Observation | Diagnosis | Action |
|---|---|---|
| `db/q` ≈ **8 ms** | **Expected post-move.** Amsterdam↔London, working as intended | Proceed to Phase 2, then 3 |
| `db/q` > **25 ms** | The move didn't take, or the service didn't redeploy in the new region | Check `RAILWAY_REPLICA_REGION` in the startup log before writing any code |
| `db/q` < 5 ms but `total` high | Event-loop blocking | Phase 3.4 (bcrypt) |
| `wall − total` > 200 ms | Network: client→Vercel or Vercel edge→Railway | Check the rewrite target |
| First request after ≥5min idle is 1–3 s | Neon scale-to-zero | Phase 2.3 |
| `total` < 100 ms yet it *feels* slow | **The expected post-move outcome.** Purely client-side round trips | Phase 4 is the priority |

Neon's region is in the hostname (`ep-…eu-west-2.aws.neon.tech` → London). Railway's is Service → Settings → Deploy → Region, and is now Amsterdam — ~8 ms to London. For reference, the pre-move US↔London gap was ~140 ms × 10 queries, which is what this plan was originally written against.

**Also confirm on the first post-move deploy:** environment variables survived the region change (`DATABASE_URL`, `SECRET_KEY`), and Alembic still ran on boot. The start command lives only in Railway's dashboard — there is still no Procfile in the repo (Phase 2.4).

**Verify:** `uv run pytest -q` unchanged; header absent when `PERF_HEADERS` off; `X-Query-Count` matches a manual count with `echo=True`. Record a before-table for `POST /stories/{id}/tasks`, `PATCH /tasks/{id}`, `POST /projects/{id}/stories`, `GET /projects` — locally and against Railway.

---

## Phase 2 — Infra / connection config

**`backend/app/db/database.py:26-32`** — currently no `pool_pre_ping`, no `pool_recycle`, no statement-cache config.

```python
_is_pooler = "-pooler" in (urlparse(_db_url).hostname or "")
_engine_kwargs: dict = {}
if _is_pooler:
    # PgBouncer transaction mode hands the server connection back after every
    # transaction, so a named prepared statement created on backend A is invisible
    # when the next statement lands on backend B. asyncpg names and caches every
    # statement implicitly -> intermittent InvalidSQLStatementNameError /
    # DuplicatePreparedStatementError under concurrency. 0 forces unnamed statements.
    _connect_args["statement_cache_size"] = 0
    _engine_kwargs["prepared_statement_cache_size"] = 0

engine = create_async_engine(
    _db_url, connect_args=_connect_args,
    pool_size=5, max_overflow=10,      # was 10/20 — 30 conns from a 1-process app is pointless
    pool_pre_ping=True,
    pool_recycle=240,                  # < Neon's ~5min idle suspend
    echo=False, **_engine_kwargs,
)
```

Notes:
- The statement-cache settings are **conditional on `-pooler`**. On a direct endpoint the cache is a genuine win — don't disable it there. Confirm which endpoint Railway uses (Variables tab, or the Phase-1 startup log).
- `prepared_statement_cache_size` is a `create_engine`-level dialect kwarg, not a `connect_args` entry — verify against the installed SQLAlchemy 2.x. Fallback: `prepared_statement_name_func=lambda: f"__asyncpg_{uuid4()}__"`.
- **`pool_pre_ping` costs one extra `SELECT 1` RTT per checkout.** **[Post-move] Ship it.** This was the one setting gated on the region question: at ~140 ms it would have made things measurably worse, at ~8 ms it is noise against the reconnect reliability it buys. (`pool_recycle` alone would still do most of the job if you ever want zero added latency.)

**Neon scale-to-zero (2.3):** ~5min idle suspend, 0.5–3s cold start. Preferred fix: an external `/health` cron ping every 4 minutes (Railway cron / GitHub Actions / UptimeRobot) where `/health` runs a real `SELECT 1` so it keeps the *compute* warm. Check the Neon usage graph first — a 24/7 ping burns free-tier compute-hours; restricting to 07:00–23:00 halves it. Do **not** ping from inside the app — Railway may sleep the container, giving two sleep behaviours to reason about.

**2.4 — get the start command into the repo.** There is **no `Procfile`, `Dockerfile`, `railway.json`, or `nixpacks.toml` anywhere** (`docs/deployment.md:274` documents a Procfile that doesn't exist). Railway is running a dashboard-only start command. Add `backend/Procfile`:
```
web: alembic upgrade head && uvicorn app.api.main:app --host 0.0.0.0 --port $PORT --workers 2 --timeout-keep-alive 65
```
`--workers 2` is resilience, not throughput (one blocked worker won't stall the service); check Railway memory headroom first. `--timeout-keep-alive 65` lets Vercel's edge reuse connections instead of re-TLS-ing. Fix `docs/deployment.md` to match, and clear the dashboard start command so the Procfile is picked up.

**Risk: this is the only phase that can break production outright** (a wrong kwarg = boot failure). `backend/tests/conftest.py:31` builds its **own** `NullPool` engine, so **none of these settings are test-covered.** Deploy to a preview service or watch the first boot log.

**Verify:** `uv run pytest -q` green (proves no kwarg/import error). Load probe — `for i in $(seq 1 50); do curl -s -o /dev/null -X POST <write> & done; wait` — then grep Railway logs for `InvalidCachedStatementError|DuplicatePreparedStatement`; expect zero. Cold start: `sleep 600 && curl -w '%{time_total}\n' -o /dev/null -s <url>/health` before/after keepalive.

---

## Phase 3 — Backend round-trip reduction

**[Post-move] Read the ranking differently now.** These were ranked when a round trip cost ~140 ms. At ~8 ms the whole phase saves roughly 40 ms per write rather than ~700 ms — real, but no longer the headline. Two items keep their original weight regardless of latency: **3.4 (bcrypt)**, which is a concurrency correctness bug rather than a latency optimisation, and **3.6 (the missing index)**, which is a schema fix. If you are triaging, do those two and Phase 4, and treat the rest as cleanup.

Ranked by impact on one `POST /stories/{id}/tasks`:

| # | Change | Queries removed | Effort | Rank |
|---|---|---|---|---|
| 3.1 | Single preflight query on create/update | **−5** | M | 1 |
| 3.2 | Request-scoped permission memoization | −2 per *additional* check in a request | S | 2 |
| 3.4 | bcrypt → threadpool | 0 queries, −250–400ms of *loop block* | S | 3 (do regardless) |
| 3.3 | Drop needless `flush()` / `refresh()` | −1 create, −1 sprint create | XS | 4 |
| 3.6 | `project_members(user_id)` index | seq scan → index scan on 3 hot endpoints | XS | 5 |
| 3.5 | Status-list memoization | −1 create_task, −2 create_project | XS | 6 |
| 3.7 | `time_tracking` N+1 | O(stories×4) → O(1); not on write path | M | 7 |
| 3.8 | Bulk status-reorder endpoint | N requests → 1 | S | 8 |

### 3.1 One preflight query — the big one

`create_task` ([task_service.py:79-129](backend/app/api/services/task_service.py:79)) issues sequentially: `db.get(User)` (auth dep) → `db.get(Story)` → `db.get(Project)` → `select(ProjectMember)` → `select(ProjectStatus)` → optional `db.get(Sprint)` → `select(max(Task.position))` → `flush` → INSERT history → COMMIT. **9–10 RTTs.**

Replace steps 2–5 and 7 with one query — `_story_write_preflight(story_id, user, db)` returning `(project_id, role, status_slugs, max_position)`:

```python
M = aliased(ProjectMember)
status_slugs = (select(func.array_agg(aggregate_order_by(ProjectStatus.slug, ProjectStatus.order.asc())))
                .where(ProjectStatus.project_id == Story.project_id).correlate(Story).scalar_subquery())
max_pos = (select(func.coalesce(func.max(Task.position), 0))
           .where(Task.story_id == story_id).scalar_subquery())
row = (await db.execute(
    select(Story.project_id, Project.owner_id, M.role, status_slugs, max_pos)
    .join(Project, Project.id == Story.project_id)
    .outerjoin(M, and_(M.project_id == Story.project_id, M.user_id == user.id))
    .where(Story.id == story_id)
)).first()
if row is None: raise HTTPException(404, "Story not found")     # error-code parity
project_id, owner_id, member_role, slugs, max_position = row
role = RoleEnum.manager if owner_id == user.id else member_role
if role is None: raise HTTPException(403, "Not a project member")
```

`create_task` then becomes: preflight → validate slug in Python → construct `Task` (id is client-side `uuid.uuid4`) → `db.add(task)` → `db.add(history)` → `commit`. **5 RTTs, down from 10.**

Apply the same to `create_task_for_project` (`:132-186`, keyed on the default Backlog story) and a slimmer variant for `update_task` (`:246`).

**Risk: medium — the only change altering SQL semantics.** Error-code parity is the thing to guard: missing story → 404, non-member → 403, bogus slug → 422. All three cases already exist in `tests/test_api_tasks.py`; confirm they pass rather than trusting the merged query. `aggregate_order_by` is Postgres-specific — fine, the project is Postgres-only.

### 3.2 Request-scoped permission memoization

`require_project_access` / `resolve_role` ([permissions.py:16-82](backend/app/auth/permissions.py:16)) have zero caching; `db.scalar(select(ProjectMember))` is a real query every call. The right scope is **the session** — `get_db` yields a fresh `AsyncSession` per request and every service already receives `db`. No new plumbing, no cross-request leakage.

Cache in `db.info.setdefault("_project_access", {})` keyed `(user.id, project_id)`, storing either the `RoleEnum` or the raised `HTTPException` (negative caching — 404/403 are stable within a request). Add `invalidate_project_access(db, project_id=None)` and call it from `project_service`'s `add_member`/`update_member`/`remove_member`/`delete_project`/ownership transfer, and `invitation_service`'s accept path. Grep target: `grep -rl require_project_access app`.

**Explicitly not a global cache.** A process-wide TTL cache would let a removed member keep access for the TTL, and with `--workers 2` you'd have two divergent caches.

**Plan for this breakage:** `tests/test_auth_permissions.py:39-43` builds `db` as a bare `AsyncMock()`, so `db.info.setdefault(...)` returns a `MagicMock` and ~10 tests fail confusingly. One-line fix: add `db.info = {}` to `make_db()`. Also `api_db` (`conftest.py:50-66`) is one session per test — a test that flips a member's role mid-test now sees the cached value, which is a *good* test of the invalidation wiring.

**Impact honesty:** once 3.1 lands this saves nothing on a single create (only one check). It pays off on `time_tracking_service.py:82/107`, `comment_service`, and anything that loops.

### 3.3 Remove needless flush / refresh
- `task_service.py:118`, `:175` — delete (subsumed by 3.1). `Task.id`/`StatusHistory.id` are client-side `uuid4` and SQLAlchemy sorts INSERTs by FK dependency, so `tasks` still lands before `status_history`.
- `story_service.py:96`, `project_service.py:97`, `auth_service.py:51` — delete.
- **Keep `project_service.py:107`** — `seed_default_statuses` only does `db.add(...)`, and `get_default_status_slug` immediately re-SELECTs with `autoflush=False`. Removing it breaks project creation. Better fix: read the default slug from the in-memory `DEFAULT_STATUSES` list (`project_status_service.py:16-21`), removing both the flush *and* the SELECT.
- **`sprint_service.py:75`** — `await db.refresh(sprint)` is pure waste under `expire_on_commit=False`. Delete it and build the response from `(sprint, task_count=0, total_effort=0)` directly rather than calling `_build_response`, which adds an aggregate query for a sprint that provably has no tasks.

### 3.4 bcrypt off the event loop

rounds=12 blocks ~250–400ms, called synchronously from `auth_service.py:30,46,74,76,171,184,186`, `admin/users_service.py:31`, and — worst — a **loop** over candidate API keys at `dependencies.py:62-68` (N × 300ms of fully blocked loop).

Keep the sync functions (CLI + admin panel use them); add `hash_password_async` / `verify_password_async` wrappers using `starlette.concurrency.run_in_threadpool`, and move the whole API-key candidate loop into a single threadpool call. Note the `key_prefix == ""` legacy fallback can make `candidates` the entire table — worth its own follow-up issue.

**Why this matters for *write* latency:** single uvicorn process — every login anywhere freezes every concurrent task-create for 300ms. If the slowness is bursty, this is it.

### 3.5–3.8 (lower priority)
- **3.5** Status memoization via the same `db.info` mechanism in `get_project_statuses_ordered`; invalidate from create/update/delete/seed. Not a global TTL — a deleted status would keep validating.
- **3.6** `Index("ix_project_members_user_id", "user_id")` on `project_member.py:18` + Alembic migration (down_revision = `f633f1a439cc`). **Use `CREATE INDEX IF NOT EXISTS`** — commit `c4632e2` is literally *"Fix for duplicate index creation"*. Benefits `list_projects`, `search_service`, `recent_service`, all of which do `WHERE user_id = ?` against a `(project_id, user_id)` PK.
- **3.7** `get_project_time_report` (`time_tracking_service.py:81-88`) loops stories × ~4 queries, unbounded. One joined query over `StatusHistory` + Python aggregation. 3.2 alone recovers most of this for free. Separately: `get_user_time_report` never checks the caller may see that user's aggregate — follow-up ticket, out of scope.
- **3.8** `PATCH /projects/{id}/statuses/reorder`, mirroring `TaskReorderRequest` + `reorder_tasks` (`task_service.py:307-334`). Pairs with the Phase-4 `ProjectStatusManager` fix.

### 3.9 Accept client-supplied IDs (unblocks Phase 4)

`TaskCreate` has `extra="forbid"` and no `id` field ([task.py:9-10](backend/app/api/schemas/task.py:9)), so a client-generated id is a 422 today. Add `id: UUID | None = None`, use `Task(id=data.id or uuid.uuid4(), …)`, and wrap the commit to turn `IntegrityError` into a 409. Additive and backwards-compatible. Do the same for `StoryCreate` and `SprintCreate`.

This makes the optimistic row's id stable from frame 1 — no `tmp:` prefixes, no reconciliation, no dnd-kit exclusions — and makes a double-submitted create a harmless 409 instead of a duplicate task. IDs are not capabilities here (access is still gated by `require_project_access`), so a client picking its own UUID grants nothing. ~10 backend lines + tests in `test_api_tasks.py`.

---

## Phase 4 — Frontend optimistic mutations (the heart of it)

### 4.0 Prerequisite
`usePagination.ts` returns `items` with no setter, so no consumer can patch a row. Return `setItems` too — `useTasks`/`useStories`/`useProjects` spread `...pagination` and inherit it. Three lines; unblocks everything below.

### 4.1 The shared abstraction

Two pieces. **`frontend/src/hooks/useOptimistic.ts`** — a `run(spec)` runner where:
```ts
interface OptimisticSpec<TRes> {
  optimistic: () => (() => void)   // apply now, RETURN a rollback thunk
  request: () => Promise<TRes>     // resolve with the response BODY, never a refetch
  onSuccess?: (res: TRes) => void  // reconcile with the authoritative server object
  key?: string                     // dedupe; a second run() with a live key is dropped
  successMessage?: string
  errorMessage?: string
}
```
Plus `isPending(key)` for disabling controls.

Design decisions: `optimistic()` returns *its own* rollback rather than the hook snapshotting state — that's what lets one signature cover the two-list cross-story drag (the thunk closes over both snapshots) and a simple `setTask`. `isDemoBlockedError` is handled once centrally instead of in ~12 catch blocks. `getApiErrorMessage` (`utils/errors.ts:7`) surfaces real server messages — important for `deleteStatus`, which legitimately 422s with *"Status 'x' is in use by 3 task(s)"* (`project_status_service.py:124`), a message currently thrown away.

**`frontend/src/utils/optimistic.ts`** — `patchInList` / `removeFromList` / `replaceInList` / `prependToList`.

> **Subtlety that silently breaks rollback:** capture `prev` from the *passed-in* array synchronously, **not** inside the `setList` updater. React defers updaters until re-render, so computing `prev` inside one returns a closure over `undefined` and the rollback silently no-ops. Every caller already has the array in scope.

### 4.2 Flagship conversion — `StoryDetailPage.tsx:123-134`

Before: `await tasksApi.update(...)` → `tasksHook.refresh()` → toast. 2 sequential RTTs, `<select>` stays open, row unchanged throughout.

After: 1 RTT, paints immediately, rolls back on failure, double-submit-proof.
```tsx
const handleTaskFieldChange = (taskId, field, value) => {
  setEditingTaskField(null)                       // close the select right away
  return run<TaskResponse>({
    key: `task:${taskId}:${field}`,
    optimistic: () => patchInList(tasksHook.items, tasksHook.setItems, taskId, { [field]: value }),
    request: () => tasksApi.update(taskId, { [field]: value }).then(r => r.data),
    onSuccess: (task) => replaceInList(tasksHook.setItems, task),
    successMessage: field === 'status' ? t('tasks.status_updated') : t('tasks.priority_updated'),
  })
}
```
`onSuccess` still overwrites with the server object — the server may normalise the value and returns a fresh `updated_at`. **The optimistic paint is a prediction; the response is the truth.**

### 4.3 Handlers to convert

Start with the **pure-deletion wins** (remove a round trip, zero new logic): `StoryDetailPage:403` (the `CreateTaskModal` already hands back the created `TaskResponse` at `CreateTaskModal.tsx:93` — prepend it instead of `refresh()`), `ProjectsPage:84`, `SprintView:326`.

- **`StoryDetailPage`** — `:89`, `:102` (add optimistic paint to existing response-body use), `:115` `handleSaveDesc` (**has no try/catch at all** — failure is an unhandled rejection and the editor closes anyway), `:123` (flagship), `:136`, `:403`, `:441`.
- **`ProjectDetailPage`** — `:347`, `:355` (**no error handling**), `:363` `handleArchive` (2 writes + a GET), `:383`, `:420`, `:434` (move the splice *before* the await), `:1282` (also drop `tasksByStory[storyId]`, restore on rollback), and the two drag handlers `:505-544`/`:550-621` — these currently `.catch(() => {})` the reorder calls entirely, so a failed reorder leaves the UI showing an order the server doesn't have, silently. `:1147-1155` is already correct; leave it.
- **`TaskDetailPage`** — `:86,:100,:114,:126,:149,:161,:176`, seven identical handlers. `handleStoryChange` (`:126`) additionally chains a `storiesApi.get` — resolve from the already-loaded `stories` array (`:35`).
- **`ProjectsPage`** `:84,:100,:110`; **`SprintView`** `:326,:348,:365`; **`SprintDetailPage`** `:57-67`; **`CommentList`** `:49,:65,:76`.
- **`ProjectStatusManager`** — `:45-54` (`disabled={saving}` freezes the name input mid-edit on every blur), `:56-59` `deleteStatus` (surface the server's 422 message), `:247-267` `handleDrop` (optimistic reorder up front + 3.8's bulk endpoint → 1 request).
- **Not on the list: `TabConfigPanel.tsx`** — already correct (local state first, 300ms debounce, `prevOrder`/`prevHidden` rollback at `:91-96`).

### 4.4 Mount waterfalls

**`TaskDetailPage.tsx:47-84` — the depth-4 chain is unnecessary, not merely serial.** `tasksApi.get` already returns `project_id`, which `:56` reads and then ignores in favour of `storiesApi.get(story_id).then(s => s.project_id)` at `:62`. Rewrite as `tasksApi.get(taskId)` → `setLoading(false)` immediately → `Promise.all([storiesApi.list(pid), projectsApi.get(pid), projectsApi.listMembers(pid), story_id && storiesApi.get(story_id)])`. Critical path 4 RTTs → 2, and the full-page skeleton drops after RTT 1 instead of RTT 4 (`.finally` at `:82` currently waits for the whole async body).

Also: `StoryDetailPage:83` duplicates `listMembers` with `useRole.ts:24` — lift into a shared `useProjectMembers(projectId)` now. Leave `ProjectDetailPage:319-344`'s `fetchingStoriesRef` fan-out for Phase 5; half-fixing a cache is worse than leaving it.

### 4.5 Stale aggregates in SprintView
`sprint.task_count`/`total_effort` are server-computed and never refreshed after a drag, so the badges lie. Don't fix with a refetch — derive locally from the existing `sprintTaskMap` (`:422-431`). **But** `allTasks` is capped at `limit: 500` (`:312`), so guard on `next_cursor == null`; when truncated, fall back to the server values and schedule a debounced (~1s) refresh after drags settle.

**Risk: medium-high in aggregate, low per handler.** ~10 files, ~35 call sites, and **the frontend has no test runner** (no vitest/jest in `package.json`). Land in ~5 PRs grouped by page, each independently revertable, starting with the pure-deletion wins.

---

## Phase 5 — TanStack Query (separately approvable)

**Decide this after Phase 4 ships, with real numbers in hand.**

Shape: a `qk` query-key module; `useInfiniteQuery` for cursor pagination (`PaginatedResponse` is already exactly `{items, next_cursor}`); `onMutate`/`onError` for rollback. Migration order: provider + `queryClient.clear()` on logout → leaf read-only hooks (statuses, sprints, members — immediate free dedup) → `useInfiniteQuery` for tasks/stories/projects (**delete `usePagination.ts`**) → `useQueries` for the story fan-out → convert `run()` call sites to `useMutation`, one page per PR.

> **The trap:** the idiomatic-looking `onSettled: () => qc.invalidateQueries(...)` is *exactly* the `await mutate(); refresh()` anti-pattern, in nicer clothing. Use `setQueryData` from the response body. Invalidate only where the write has a server-computed side effect the response doesn't carry.

Three config items: `retry` must be constrained (default 3 retries would turn a 422 into 4 failed writes); `refetchOnWindowFocus: false` (the default would *add* traffic to an app whose complaint is latency); and **`queryClient.clear()` on logout** — without it, logging in as a second user briefly renders the first user's projects. That last one is the only genuinely new failure mode the library introduces. The existing axios 401-refresh interceptor (`api.ts:241-257`) sits *below* TanStack Query and needs no changes.

### Tradeoff

**Deletes:** `usePagination.ts` (26 lines); `ProjectDetailPage:319-344`'s `fetchingStoriesRef` + `tasksByStory` (~35 lines — a request cache reinvented badly, which never refetches, never invalidates, and caches `[]` on error permanently); triplicate `listMembers`; per-page remounting of statuses/sprints; `cancelled` race flags in 5 mount effects (~20 lines); per-page `isLoading`/`error` duplication (~40 lines).

**Stays hand-rolled either way:** server latency (zero overlap with Phases 1–3); the optimistic patch/rollback *logic* — you still write `patchPages`/`replacePages` (~40 lines) for the infinite-query page shape, which is **more** code than `patchInList`; ~120 lines of dnd-kit reorder maths; the 401 interceptor; demo-mode write blocking.

**Costs:** ~12–13 kB min+gzip; ~18 files touched; concepts to carry (query keys, `staleTime`, page shape, `cancelQueries`, cache clearing); and **zero frontend test coverage** means every step is verified by hand — the strongest argument for keeping it separate and revertable.

**Recommendation:** Phases 1–3 fix the reported problem. Phase 4 fixes the *perceived* problem and is where the user-visible transformation happens. Phase 5 buys maintainability and deletes accidental complexity but almost no additional speed on top of Phase 4. **If the goal is the smallest change that makes the app feel fast, stop after Phase 4.** Take Phase 5 if you expect to keep adding pages, or if the duplicate-fetch class of bug has already bitten you more than once.

---

## Verification

**Per phase:** `cd backend && uv run pytest -q && uv run ruff check .`; `cd frontend && npm run lint && npm run build`.

**Phase 1** — record the before-table (`X-Query-Count`, `Server-Timing total`/`db`, curl `time_total`) for four endpoints, locally and deployed. Compare against the threshold table.

**Phase 3** — full suite, with these files specifically at risk: `test_api_tasks.py`, `test_api_stories.py`, `test_api_projects.py`, `test_api_sprints.py` (3.1/3.3); `test_auth_permissions.py` (**`make_db` at `:39` needs `db.info = {}`**); `test_auth_security.py`/`test_auth_hardening.py`/`test_auth_dependencies.py`/`test_demo_account.py` (3.4); `test_api_time_tracking.py` (3.7).

Add **`backend/tests/test_query_budget.py`** exposing the Phase-1 counter as a fixture — this is what stops the regression returning in six months:
```python
assert n.value <= 5, f"create_task regressed to {n.value} queries"
```
Budgets: create task ≤5, `PATCH /tasks/{id}` ≤4, create story ≤5, time-report ≤4.

Index: `alembic upgrade head`, then `downgrade -1 && upgrade head`; then `alembic revision --autogenerate -m tmp` must produce an **empty** migration (discard it), proving model and DB agree. `EXPLAIN ANALYZE SELECT * FROM project_members WHERE user_id = '…'` → `Index Scan`.

bcrypt: fire 5 simultaneous `POST /auth/login` + 5 `GET /health`; the slowest health check should go from ~1.5s to single-digit ms.

**Phase 4** — no backend tests apply; use scripted failure injection, not eyeballing:
- Add a dev-only `localStorage.__failWrites` switch in `api.ts`'s request interceptor that rejects all POST/PUT/PATCH/DELETE with a synthetic 500. Then per handler assert **three** things: the UI changes instantly, it reverts, and exactly one error toast appears. Sweeping all ~35 call sites takes ~20 minutes and is the only thing that proves the rollback thunks are wired.
- DevTools custom throttling at 300ms latency: every optimistic handler must paint at t=0. Any handler still waiting 300ms was missed.
- Network tab filtered to `/api/v1`: a status change on StoryDetailPage produces **1** request (was 2); creating a task from the modal is 1 POST and **0** follow-up GETs.
- Double-click Save and double-blur the effort input at 300ms latency → exactly one PATCH each.
- TaskDetailPage waterfall: `performance.getEntriesByType('resource')` filtered to `/api/v1` — distinct `startTime` buckets drop from 4 to 2, and the skeleton clears after the first response, not the last.
- Drag a task with non-null `effort` between sprints → both effort badges update immediately and match a manual reload.

**Phase 5** — repeat the entire Phase-4 checklist (the injected-failure switch still works, since it lives in axios below the library); `ls -la dist/assets/*.js` before/after for bundle delta; TaskDetailPage `/members` requests → 1 (was 2–3); `CreateTaskModal` open → 0 new requests (was 4); log in as A → log out → log in as B, and B must never see A's data even for one frame; grep the diff for `invalidateQueries` and justify each occurrence individually.

---

## Critical files

`backend/app/db/database.py` · `backend/app/api/services/task_service.py` · `backend/app/auth/permissions.py` · `backend/app/auth/security.py` · `backend/app/api/main.py` · `backend/app/api/schemas/task.py` · `frontend/src/hooks/usePagination.ts` · `frontend/src/pages/StoryDetailPage.tsx` · `frontend/src/pages/ProjectDetailPage.tsx` · `frontend/src/pages/TaskDetailPage.tsx`
