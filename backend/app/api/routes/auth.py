from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field
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
async def login(data: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Login and get tokens. Refresh token is set as an httpOnly cookie."""
    result = await auth_service.login(data.email, data.password, db)
    response.set_cookie(
        key="spt_refresh",
        value=result["refresh_token"],
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",
    )
    return {"access_token": result["access_token"], "token_type": "bearer"}


@router.post("/refresh")
async def refresh(
    spt_refresh: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using httpOnly cookie."""
    if not spt_refresh:
        raise HTTPException(status_code=401, detail="No refresh token")
    return await auth_service.refresh_token_fn(spt_refresh, db)


@router.post("/logout")
async def logout(response: Response):
    """Clear the refresh token cookie."""
    response.delete_cookie(key="spt_refresh", path="/api/v1/auth/refresh")
    return {"message": "Logged out"}


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


class ResendConfirmationRequest(BaseModel):
    email: EmailStr


@router.post("/resend-confirmation")
async def resend_confirmation(
    data: ResendConfirmationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Resend confirmation email. Always returns 200 to avoid leaking account existence."""
    await auth_service.resend_confirmation(data.email, db, background_tasks)
    return {"message": "If that email is registered and unconfirmed, a new link has been sent"}


class PasswordResetRequest(BaseModel):
    email: EmailStr


@router.post("/password-reset")
async def request_password_reset(
    data: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Request password reset. Sends reset link via email."""
    await auth_service.request_password_reset(data.email, db, background_tasks)
    return {"message": "If that email is registered, a reset link has been sent"}


class ConfirmPasswordResetRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    data: ConfirmPasswordResetRequest, db: AsyncSession = Depends(get_db)
):
    """Confirm password reset with token."""
    await auth_service.confirm_password_reset(data.token, data.new_password, db)
    return {"message": "Password updated"}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password for the currently authenticated user."""
    await auth_service.change_password(data.current_password, data.new_password, user, db)
    return {"message": "Password updated"}
