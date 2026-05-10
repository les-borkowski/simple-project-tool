from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.user import UserCreate, UserResponse
from app.api.services import auth_service
from app.auth.dependencies import get_current_user
from app.auth.security import create_email_confirmation_token
from app.core.config import settings
from app.core.email import send_admin_new_user_notification, send_confirmation_email
from app.db.database import get_db
from app.db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user. Sends confirmation email; login is blocked until confirmed."""
    user = await auth_service.register(data, db)
    token = create_email_confirmation_token(user.id)
    background_tasks.add_task(send_confirmation_email, user.email, user.name, token)
    if settings.ADMIN_EMAIL:
        background_tasks.add_task(send_admin_new_user_notification, user.email, user.name)
    return user


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


class ConfirmEmailRequest(BaseModel):
    token: str


@router.post("/confirm-email")
async def confirm_email(data: ConfirmEmailRequest, db: AsyncSession = Depends(get_db)):
    """Confirm email address with the token from the confirmation email."""
    await auth_service.confirm_email(data.token, db)
    return {"message": "Email confirmed"}


class PasswordResetRequest(BaseModel):
    email: EmailStr


@router.post("/password-reset")
async def request_password_reset(
    data: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Request password reset. Sends reset link via email."""
    result = await auth_service.request_password_reset(data.email, db, background_tasks)
    return {"reset_token": result}


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
