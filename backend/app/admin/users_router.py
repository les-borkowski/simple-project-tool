import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.auth import is_admin_session
from app.admin.users_service import (
    block_user,
    create_user,
    delete_user,
    get_all_users,
    send_password_reset,
    unblock_user,
    verify_user,
)
from app.db.base import RoleEnum
from app.db.database import get_db

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def _require_admin(request: Request) -> bool:
    if not is_admin_session(request):
        return False
    return True


def _flash(request: Request, *, success: str | None = None, error: str | None = None) -> None:
    if success:
        request.session["flash_success"] = success
    if error:
        request.session["flash_error"] = error


def _redirect_users(request: Request) -> RedirectResponse:
    return RedirectResponse(url="/admin/users", status_code=302)


@router.get("/users", response_class=HTMLResponse)
async def users_list(request: Request, db: AsyncSession = Depends(get_db)):
    if not _require_admin(request):
        return RedirectResponse(url="/admin/login", status_code=302)

    flash_success = request.session.pop("flash_success", None)
    flash_error = request.session.pop("flash_error", None)
    users = await get_all_users(db)
    return templates.TemplateResponse(
        request,
        "users/list.html",
        {
            "logged_in": True,
            "users": users,
            "flash_success": flash_success,
            "flash_error": flash_error,
        },
    )


@router.get("/users/new", response_class=HTMLResponse)
async def users_new(request: Request):
    if not _require_admin(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    flash_error = request.session.pop("flash_error", None)
    return templates.TemplateResponse(
        request,
        "users/create.html",
        {"logged_in": True, "flash_error": flash_error},
    )


@router.post("/users")
async def users_create(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    role: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    if not _require_admin(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    try:
        role_enum = RoleEnum(role)
        await create_user(db, email=email, name=name, password=password, role=role_enum)
        _flash(request, success=f"Account created for {email}")
    except Exception as exc:
        detail = getattr(exc, "detail", str(exc))
        _flash(request, error=f"Failed to create user: {detail}")
        return RedirectResponse(url="/admin/users/new", status_code=302)
    return _redirect_users(request)


@router.post("/users/{user_id}/verify")
async def users_verify(
    request: Request,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    if not _require_admin(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    try:
        await verify_user(db, user_id)
        _flash(request, success="Email verified")
    except Exception as exc:
        _flash(request, error=f"Error: {getattr(exc, 'detail', str(exc))}")
    return _redirect_users(request)


@router.post("/users/{user_id}/block")
async def users_block(
    request: Request,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    if not _require_admin(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    try:
        await block_user(db, user_id)
        _flash(request, success="User blocked")
    except Exception as exc:
        _flash(request, error=f"Error: {getattr(exc, 'detail', str(exc))}")
    return _redirect_users(request)


@router.post("/users/{user_id}/unblock")
async def users_unblock(
    request: Request,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    if not _require_admin(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    try:
        await unblock_user(db, user_id)
        _flash(request, success="User unblocked")
    except Exception as exc:
        _flash(request, error=f"Error: {getattr(exc, 'detail', str(exc))}")
    return _redirect_users(request)


@router.post("/users/{user_id}/reset-password")
async def users_reset_password(
    request: Request,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    if not _require_admin(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    try:
        await send_password_reset(db, user_id)
        _flash(request, success="Password reset email sent")
    except Exception as exc:
        _flash(request, error=f"Error: {getattr(exc, 'detail', str(exc))}")
    return _redirect_users(request)


@router.post("/users/{user_id}/delete")
async def users_delete(
    request: Request,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    if not _require_admin(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    try:
        await delete_user(db, user_id)
        _flash(request, success="User deleted")
    except Exception as exc:
        _flash(request, error=f"Error: {getattr(exc, 'detail', str(exc))}")
    return _redirect_users(request)
