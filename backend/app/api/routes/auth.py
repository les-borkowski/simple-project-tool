from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.api.schemas.user import UserCreate, UserResponse
from app.api.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user."""
    return await auth_service.register(data, db)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login and get tokens."""
    return await auth_service.login(data.email, data.password, db)


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh access token."""
    return await auth_service.refresh_token_fn(data.refresh_token, db)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Get current user info."""
    return await auth_service.get_me(user)


class PasswordResetRequest(BaseModel):
    email: EmailStr


@router.post("/password-reset")
async def request_password_reset(
    data: PasswordResetRequest, db: AsyncSession = Depends(get_db)
):
    """Request password reset (returns token for demo; normally sent via email)."""
    token = await auth_service.request_password_reset(data.email, db)
    return {"reset_token": token}


class ConfirmPasswordResetRequest(BaseModel):
    token: str
    new_password: str


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    data: ConfirmPasswordResetRequest, db: AsyncSession = Depends(get_db)
):
    """Confirm password reset with token."""
    await auth_service.confirm_password_reset(data.token, data.new_password, db)
    return {"message": "Password updated"}
