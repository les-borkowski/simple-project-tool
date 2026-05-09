# Change Password — Design Spec

**Date:** 2026-05-09
**Scope:** Settings > Security tab — authenticated "change password" form

## Overview

Replace the Security tab placeholder with a working "change password" form. The user enters their current password and a new password. On success, a modal lets them choose to stay logged in or log out.

Forgot-password / token-based reset is explicitly out of scope until email sending is implemented.

## Backend

### New endpoint

`POST /auth/change-password` — authenticated (JWT required).

**Request body:**
```json
{ "current_password": "...", "new_password": "..." }
```

**Behaviour:**
1. Verify `current_password` against the stored bcrypt hash. Return `400 Bad Request` with `"detail": "Current password is incorrect"` if wrong.
2. Hash `new_password` with bcrypt (rounds=12, matching existing convention).
3. Persist the new hash. Return `200 OK` with `{"message": "Password updated"}`.

**Location:** `backend/app/api/routes/auth.py` (route) + `backend/app/api/services/auth_service.py` (service function `change_password`).

No DB schema changes required.

## Frontend

### Security tab — `ConfigPage.tsx`

Replace the `tab === 'security'` section (currently a placeholder) with a card containing:

- Heading: "Change password"
- Three password inputs:
  - Current password
  - New password
  - Confirm new password
- Submit button ("Update password")

**Client-side validation (before submit):**
- New password must not be empty.
- Confirm new password must match new password. Error shown inline below the confirm field.
- No minimum length enforced client-side (backend is authoritative).

**On submit:**
- Call `authApi.changePassword(currentPassword, newPassword)`.
- Show a loading/disabled state on the submit button.
- On `400` from backend: show "Current password is incorrect" error below the current password field.
- On success: open the confirmation modal.

### Confirmation modal

Triggered by a successful password change response. Contains:

- Heading: "Password changed"
- Body: "Your password has been updated successfully."
- Two buttons:
  - **Stay logged in** — closes the modal, resets all three form fields to empty.
  - **Log out** — calls the existing logout function, redirects to the login page.

The modal is implemented inline in the Security tab section (not via `ConfirmDialog`, which only supports a single confirm action). It uses the same visual pattern: `fixed inset-0 z-50 flex items-center justify-center bg-black/40` backdrop, stone card with `rounded-lg shadow-xl p-6 max-w-sm`.

### API client — `frontend/src/services/api.ts`

Add to the `authApi` object:

```ts
changePassword: (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
```

### i18n

Add keys to both `en-GB.json` and `pl.json`:

| Key | en-GB | pl |
|-----|-------|----|
| `config.change_password` | Change password | Zmień hasło |
| `config.current_password` | Current password | Aktualne hasło |
| `config.new_password` | New password | Nowe hasło |
| `config.confirm_new_password` | Confirm new password | Potwierdź nowe hasło |
| `config.update_password` | Update password | Zaktualizuj hasło |
| `config.password_changed_title` | Password changed | Hasło zmienione |
| `config.password_changed_body` | Your password has been updated successfully. | Twoje hasło zostało pomyślnie zaktualizowane. |
| `config.stay_logged_in` | Stay logged in | Pozostań zalogowany |
| `config.current_password_incorrect` | Current password is incorrect | Aktualne hasło jest nieprawidłowe |

## Data flow

```
User fills form → client validates confirm match
→ POST /auth/change-password { current_password, new_password }
→ Backend verifies current, hashes new, persists
→ 200 OK
→ Confirmation modal shown
   → "Stay logged in": modal closes, form resets
   → "Log out": logout() called, redirect to /login
```

## Error states

| Scenario | UI treatment |
|----------|-------------|
| Confirm doesn't match | Inline error below confirm field, no API call |
| Backend 400 (wrong current password) | Inline error below current password field |
| Backend 5xx / network error | Toast error ("Failed to update password") |
| Submit while loading | Button disabled, spinner |

## Out of scope

- Forgot password / email-based token reset
- Password strength meter or minimum length rules
- Session invalidation on other devices
