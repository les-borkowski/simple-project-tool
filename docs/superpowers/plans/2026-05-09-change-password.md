# Change Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Change password" form to Settings > Security tab, backed by a new authenticated API endpoint.

**Architecture:** New `POST /auth/change-password` endpoint verifies the current password via bcrypt then persists the new hash. The Security tab replaces its placeholder with an inline form card; on success a modal lets the user stay logged in or log out. No DB schema changes.

**Tech Stack:** FastAPI + bcrypt + JWT (backend), React 19 + TypeScript + i18next (frontend), pytest + httpx (tests).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/app/api/services/auth_service.py` | Add `change_password` service function |
| Modify | `backend/app/api/routes/auth.py` | Add `POST /auth/change-password` route |
| Modify | `backend/tests/test_api_auth.py` | Tests for the new endpoint |
| Modify | `frontend/src/services/api.ts` | Add `changePassword` to `authApi` |
| Modify | `frontend/src/locales/en-GB.json` | Add i18n keys |
| Modify | `frontend/src/locales/pl.json` | Add Polish i18n keys |
| Modify | `frontend/src/pages/ConfigPage.tsx` | Replace placeholder with form + modal |

---

## Task 1: Backend service function

**Files:**
- Modify: `backend/app/api/services/auth_service.py`
- Test: `backend/tests/test_api_auth.py`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_api_auth.py`:

```python
@pytest.mark.asyncio
async def test_change_password_success(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "testpassword123", "new_password": "newpassword456"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Password updated"


@pytest.mark.asyncio
async def test_change_password_wrong_current(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "wrongpassword", "new_password": "newpassword456"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Current password is incorrect"


@pytest.mark.asyncio
async def test_change_password_unauthenticated(api_client: AsyncClient):
    resp = await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "testpassword123", "new_password": "newpassword456"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_change_password_new_password_works(api_client: AsyncClient, auth_headers: dict):
    """After changing password, user can log in with the new one."""
    email = f"changepw_{__import__('uuid').uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "PwTest", "password": "oldpassword123"},
    )
    login_resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "oldpassword123"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "oldpassword123", "new_password": "brandnew789"},
        headers=headers,
    )

    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "brandnew789"},
    )
    assert resp.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_api_auth.py::test_change_password_success tests/test_api_auth.py::test_change_password_wrong_current tests/test_api_auth.py::test_change_password_unauthenticated tests/test_api_auth.py::test_change_password_new_password_works -v
```

Expected: 4 failures — 404 Not Found (route doesn't exist yet).

- [ ] **Step 3: Add service function**

In `backend/app/api/services/auth_service.py`, add after `confirm_password_reset`:

```python
async def change_password(
    current_password: str, new_password: str, user: User, db: AsyncSession
) -> None:
    """Verify current password and replace it with the new one."""
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(new_password)
    await db.commit()
```

- [ ] **Step 4: Add route**

In `backend/app/api/routes/auth.py`, add after `confirm_password_reset`:

```python
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password for the currently authenticated user."""
    await auth_service.change_password(data.current_password, data.new_password, user, db)
    return {"message": "Password updated"}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend
uv run pytest tests/test_api_auth.py::test_change_password_success tests/test_api_auth.py::test_change_password_wrong_current tests/test_api_auth.py::test_change_password_unauthenticated tests/test_api_auth.py::test_change_password_new_password_works -v
```

Expected: 4 PASSED.

- [ ] **Step 6: Run full auth test suite to check for regressions**

```bash
cd backend
uv run pytest tests/test_api_auth.py -v
```

Expected: all PASSED.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/services/auth_service.py backend/app/api/routes/auth.py backend/tests/test_api_auth.py
git commit -m "feat: add change-password endpoint (POST /auth/change-password)"
```

---

## Task 2: API client method

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add `changePassword` to `authApi`**

In `frontend/src/services/api.ts`, replace the `authApi` object (lines ~239–247):

```ts
export const authApi = {
  login: (email: string, password: string) =>
    api.post<TokenResponse>('/auth/login', { email, password }),
  register: (email: string, name: string, password: string) =>
    api.post<TokenResponse>('/auth/register', { email, name, password }),
  me: () => api.get<UserResponse>('/auth/me'),
  refresh: (refresh_token: string) =>
    api.post<TokenResponse>('/auth/refresh', { refresh_token }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend
npm run build 2>&1 | tail -20
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add changePassword API client method"
```

---

## Task 3: i18n keys

**Files:**
- Modify: `frontend/src/locales/en-GB.json`
- Modify: `frontend/src/locales/pl.json`

- [ ] **Step 1: Add keys to `en-GB.json`**

Add these entries (alongside the existing `config.*` keys):

```json
"config.change_password": "Change password",
"config.current_password": "Current password",
"config.new_password": "New password",
"config.confirm_new_password": "Confirm new password",
"config.update_password": "Update password",
"config.password_changed_title": "Password changed",
"config.password_changed_body": "Your password has been updated successfully.",
"config.stay_logged_in": "Stay logged in",
"config.current_password_incorrect": "Current password is incorrect"
```

- [ ] **Step 2: Add keys to `pl.json`**

Add these entries (alongside the existing `config.*` keys):

```json
"config.change_password": "Zmień hasło",
"config.current_password": "Aktualne hasło",
"config.new_password": "Nowe hasło",
"config.confirm_new_password": "Potwierdź nowe hasło",
"config.update_password": "Zaktualizuj hasło",
"config.password_changed_title": "Hasło zmienione",
"config.password_changed_body": "Twoje hasło zostało pomyślnie zaktualizowane.",
"config.stay_logged_in": "Pozostań zalogowany",
"config.current_password_incorrect": "Aktualne hasło jest nieprawidłowe"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/en-GB.json frontend/src/locales/pl.json
git commit -m "feat: add change-password i18n keys (en-GB + pl)"
```

---

## Task 4: Security tab UI

**Files:**
- Modify: `frontend/src/pages/ConfigPage.tsx`

- [ ] **Step 1: Add state variables and update hook destructuring**

In `ConfigPage.tsx`, update the `useAuth()` destructuring (currently line 45) to also extract `logout`:

```tsx
const { user, logout } = useAuth()
```

Add `useNavigate` import at the top of the file:

```tsx
import { useNavigate } from 'react-router-dom'
```

Inside `ConfigPage` function body (alongside other hooks):

```tsx
const navigate = useNavigate()
```

Add these state variables after `const { addToast } = useToast()`:

```tsx
const [currentPw, setCurrentPw] = useState('')
const [newPw, setNewPw] = useState('')
const [confirmPw, setConfirmPw] = useState('')
const [pwLoading, setPwLoading] = useState(false)
const [pwError, setPwError] = useState<{ field: 'current' | 'confirm'; message: string } | null>(null)
const [pwChanged, setPwChanged] = useState(false)
```

- [ ] **Step 2: Add password change submit handler**

In `ConfigPage`, add this function alongside `handleSaveEffortUnit`:

```tsx
const handleChangePassword = async (e: React.FormEvent) => {
  e.preventDefault()
  setPwError(null)
  if (newPw !== confirmPw) {
    setPwError({ field: 'confirm', message: t('errors.password_mismatch') })
    return
  }
  setPwLoading(true)
  try {
    await authApi.changePassword(currentPw, newPw)
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setPwChanged(true)
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    if (detail === 'Current password is incorrect') {
      setPwError({ field: 'current', message: t('config.current_password_incorrect') })
    } else {
      addToast(t('errors.generic') || 'Failed to update password', 'error')
    }
  } finally {
    setPwLoading(false)
  }
}
```

Also add the `authApi` import at the top (alongside the existing `projectsApi` import):

```tsx
import { projectsApi, authApi } from '../services/api'
```

- [ ] **Step 3: Replace the security tab placeholder**

Find and replace the `{tab === 'security' && (` block in `ConfigPage.tsx`:

**Old code (lines ~198–203):**
```tsx
{tab === 'security' && (
  <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5">
    <h3 className="text-[14px] font-medium mb-2">{t('config.security')}</h3>
    <p className="text-[13px] text-stone-500">{t('config.security_placeholder')}</p>
  </section>
)}
```

**New code:**
```tsx
{tab === 'security' && (
  <>
    <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5">
      <h3 className="text-[14px] font-medium mb-4">{t('config.change_password')}</h3>
      <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1.5">
            {t('config.current_password')}
          </label>
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full px-3 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
          {pwError?.field === 'current' && (
            <p className="mt-1 text-[12px] text-red-500">{pwError.message}</p>
          )}
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1.5">
            {t('config.new_password')}
          </label>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            required
            className="w-full px-3 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1.5">
            {t('config.confirm_new_password')}
          </label>
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
            required
            className="w-full px-3 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
          {pwError?.field === 'confirm' && (
            <p className="mt-1 text-[12px] text-red-500">{pwError.message}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={pwLoading}
          className="px-4 py-1.5 text-[12px] rounded-md accent-bg text-white disabled:opacity-50"
        >
          {pwLoading ? t('common.saving') : t('config.update_password')}
        </button>
      </form>
    </section>

    {pwChanged && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-stone-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-[16px] font-semibold text-stone-900 dark:text-stone-100 mb-2">
            {t('config.password_changed_title')}
          </h3>
          <p className="text-[13px] text-stone-500 dark:text-stone-300 mb-5">
            {t('config.password_changed_body')}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setPwChanged(false)}
              className="flex-1 px-4 py-2 text-[13px] rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700"
            >
              {t('config.stay_logged_in')}
            </button>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="flex-1 px-4 py-2 text-[13px] rounded-md accent-bg text-white"
            >
              {t('auth.logout')}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend
npm run build 2>&1 | tail -20
```

Expected: no type errors.

- [ ] **Step 5: Add `auth.logout` i18n key to both locale files**

`errors.generic` already exists. `auth.logout` does not — add it now.

In `frontend/src/locales/en-GB.json`, alongside the other `auth.*` keys, add:
```json
"auth.logout": "Log out"
```

In `frontend/src/locales/pl.json`, alongside the other `auth.*` keys, add:
```json
"auth.logout": "Wyloguj się"
```

- [ ] **Step 7: Run linter**

```bash
cd frontend
npm run lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ConfigPage.tsx frontend/src/locales/en-GB.json frontend/src/locales/pl.json
git commit -m "feat: add change-password UI to Settings > Security tab"
```

---

## Task 5: Run full test suite

- [ ] **Step 1: Run backend tests**

```bash
cd backend
uv run pytest -v 2>&1 | tail -30
```

Expected: all PASSED (no regressions).

- [ ] **Step 2: Run frontend lint**

```bash
cd frontend
npm run lint 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Run frontend build**

```bash
cd frontend
npm run build 2>&1 | tail -10
```

Expected: build succeeds with no type errors.
