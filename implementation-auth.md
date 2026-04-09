# Implementation Plan: Authentication Layer

**Module**: `backend/app/auth/`
**Depends on**: DB layer (User, APIKey, ProjectMember, Project models)
**Used by**: API layer (FastAPI Depends), CLI (conceptually via API)

---

## Overview

The auth layer handles all concerns related to identity and access: password hashing, JWT token lifecycle, API key validation, and role-based permission checks. It exposes FastAPI dependency functions that routes use to get the current authenticated user and enforce permissions. No HTTP routing or business logic lives here.

---

## 1. Files

```
backend/app/auth/
├── __init__.py
├── security.py       # All cryptographic operations
├── permissions.py    # RBAC logic + role precedence
└── dependencies.py   # FastAPI Depends() functions
```

---

## 2. `security.py` — Cryptographic Operations

### 2.1 Password hashing
```
hash_password(plain: str) -> str
    bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()

verify_password(plain: str, hashed: str) -> bool
    bcrypt.checkpw(plain.encode(), hashed.encode())
```
Use `rounds=12` — sufficient cost without being too slow for login.

### 2.2 JWT tokens
Both tokens use HS256. Payload structure:

**Access token** (15 min):
```json
{"sub": "<user_id>", "role": "manager", "type": "access", "exp": <timestamp>}
```

**Refresh token** (7 days):
```json
{"sub": "<user_id>", "type": "refresh", "exp": <timestamp>}
```

**Password reset token** (1 hour):
```json
{"sub": "<user_id>", "type": "password_reset", "exp": <timestamp>}
```

```
create_access_token(user_id: UUID, role: RoleEnum) -> str
    payload = {"sub": str(user_id), "role": role.value, "type": "access",
               "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

create_refresh_token(user_id: UUID) -> str
    — same structure, type="refresh", longer expiry

decode_token(token: str) -> dict
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

create_password_reset_token(user_id: UUID) -> str
    — type="password_reset", 1-hour expiry

verify_password_reset_token(token: str) -> UUID
    payload = decode_token(token)
    if payload.get("type") != "password_reset":
        raise HTTPException(400, "Invalid token type")
    return UUID(payload["sub"])
```

### 2.3 API key generation
```
generate_api_key() -> tuple[str, str]
    raw_key = secrets.token_urlsafe(32)      # shown to user once
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt()).decode()
    return raw_key, key_hash
```
The raw key is returned to the caller once (in the API response). Only the hash is stored in the DB.

Note: bcrypt for API key hashing is expensive per request. If performance becomes an issue, switch to `hashlib.sha256` (one-way, but not brute-force resistant). For v1, bcrypt is fine.

### 2.4 Scope checking
```
SCOPE_HIERARCHY = {
    "write:projects": {"read:projects"},
    "write:stories": {"read:stories"},
    "write:tasks": {"read:tasks"},
    "write:comments": {"read:comments"},
    "admin": {"read:projects", "write:projects", "read:stories", "write:stories",
               "read:tasks", "write:tasks", "read:comments", "write:comments"},
}

check_scope(api_key: APIKey, required_scope: str) -> bool
    if api_key.revoked_at is not None:
        return False
    granted = set(api_key.scopes)
    # expand write:* → implied read:*
    expanded = set()
    for s in granted:
        expanded.add(s)
        expanded.update(SCOPE_HIERARCHY.get(s, set()))
    return required_scope in expanded
```

---

## 3. `permissions.py` — RBAC Logic

### 3.1 Role resolution (core logic)
```
async def resolve_role(
    user: User, project_id: UUID, db: AsyncSession
) -> RoleEnum:
    """
    Precedence:
    1. If user is project owner → always Manager
    2. If ProjectMember record exists → return its role
    3. Otherwise → return user.global role
    """
    # Check ownership
    project = await db.get(Project, project_id)
    if project and project.owner_id == user.id:
        return RoleEnum.manager

    # Check ProjectMember
    stmt = select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user.id,
    )
    member = await db.scalar(stmt)
    if member:
        return member.role

    return user.role
```

### 3.2 Permission guards
```
def require_manager(role: RoleEnum) -> None:
    if role != RoleEnum.manager:
        raise HTTPException(403, "Manager role required")

async def require_project_access(
    user: User, project_id: UUID, db: AsyncSession
) -> RoleEnum:
    """Verify user is owner or ProjectMember. Returns resolved role."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    role = await resolve_role(user, project_id, db)
    # Contributors must be explicit members; non-members get no access
    if role == user.role and user.role == RoleEnum.contributor:
        # Check they actually have a member record
        stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
        member = await db.scalar(stmt)
        if not member and project.owner_id != user.id:
            raise HTTPException(403, "Not a project member")
    return role
```

---

## 4. `dependencies.py` — FastAPI Dependency Functions

### 4.1 OAuth2 scheme
```python
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
```

### 4.2 `get_current_user`
```
async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(token)           # raises 401 on invalid/expired
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    user_id = UUID(payload["sub"])
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user
```

### 4.3 `get_current_user_or_api_key`
Used by most protected routes — supports both Bearer tokens and API keys.
```
async def get_current_user_or_api_key(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Try Bearer JWT first
    if token:
        return await get_current_user(token, db)

    # Try X-API-Key header
    api_key_header = request.headers.get("X-API-Key")
    if api_key_header:
        # Hash the incoming key and look it up
        # Note: must compare all non-revoked keys for this approach
        # More efficient: store key prefix unencrypted for lookup
        stmt = select(APIKey).where(APIKey.revoked_at.is_(None))
        keys = await db.scalars(stmt)
        for key_record in keys:
            if bcrypt.checkpw(api_key_header.encode(), key_record.key_hash.encode()):
                # Update last_used_at
                key_record.last_used_at = datetime.utcnow()
                await db.commit()
                user = await db.get(User, key_record.user_id)
                # Attach api_key to request.state for scope checking
                request.state.api_key = key_record
                return user

    raise HTTPException(401, "Not authenticated")
```

**Note on API key lookup performance**: Scanning all non-revoked keys and bcrypt-checking each is O(n) and slow. Consider storing a short unencrypted key prefix (first 8 chars) in a `key_prefix` column for fast lookup. For v1 with few keys, the simple approach is acceptable.

### 4.4 `OptionalAuth`
```
async def optional_auth(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not token:
        return None
    try:
        return await get_current_user(token, db)
    except HTTPException:
        return None
```

### 4.5 Scope enforcement helper for API key requests
```
def require_scope(scope: str):
    """Factory that returns a dependency enforcing a specific scope for API key requests."""
    async def check(request: Request, user: User = Depends(get_current_user_or_api_key)):
        api_key = getattr(request.state, "api_key", None)
        if api_key and not check_scope(api_key, scope):
            raise HTTPException(403, f"API key missing scope: {scope}")
        return user
    return check
```

---

## 5. Password Reset Flow

### Step 1: Request reset
Route `POST /api/v1/auth/password-reset`:
```
1. Look up User by email
2. If not found → return 200 anyway (don't leak whether email exists)
3. Generate reset token: create_password_reset_token(user.id)
4. Log token to stdout/file (v1 — no email service):
   print(f"[PASSWORD RESET] Token for {email}: {token}")
5. Return {"message": "If that email exists, a reset link was sent"}
```

### Step 2: Confirm reset
Route `POST /api/v1/auth/password-reset/confirm`:
```
Body: {token: str, new_password: str}
1. verify_password_reset_token(token) → user_id  (raises 400 if invalid/expired)
2. Validate new_password length (min 8 chars)
3. user.password_hash = hash_password(new_password)
4. db.commit()
5. Return {"message": "Password updated"}
```

---

## 6. Refresh Token Handling (v1 — Stateless)

- On `POST /auth/login`: issue both access token and refresh token
- On `POST /auth/refresh`: decode refresh token → verify type=="refresh" → issue new access token
- On `POST /auth/logout`: return 200, client discards tokens locally (stateless)
- Full revocation (v2): store refresh token hash in a `RefreshToken` table, check on each refresh

---

## 7. Testing Checklist

- [ ] `hash_password` + `verify_password` round-trip returns True
- [ ] `verify_password` with wrong password returns False
- [ ] `create_access_token` + `decode_token` round-trip extracts correct `sub` and `role`
- [ ] Expired access token raises HTTPException 401
- [ ] Token with type="refresh" used where type="access" expected → 401
- [ ] `generate_api_key` returns distinct raw and hash values; hash verifies against raw
- [ ] `check_scope` with `write:tasks` granted → `read:tasks` passes
- [ ] `check_scope` with `read:tasks` granted → `write:tasks` fails
- [ ] `check_scope` with `admin` → all scopes pass
- [ ] Revoked API key → `check_scope` returns False
- [ ] `resolve_role` returns manager when user is project owner (even with contributor global role)
- [ ] `resolve_role` returns ProjectMember.role when record exists
- [ ] `resolve_role` returns user.role when no ProjectMember record
- [ ] `require_project_access` raises 403 for non-member contributor
- [ ] `verify_password_reset_token` with wrong type → HTTPException 400
- [ ] `verify_password_reset_token` with expired token → HTTPException 401
