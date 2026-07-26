import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.auth import require_admin_session
from app.admin.users_service import (
    block_user,
    create_user,
    delete_user,
    disable_demo,
    enable_demo,
    get_all_users,
    send_password_reset,
    unblock_user,
    verify_user,
)
from app.api.schemas.user import UserCreate
from app.db.base import RoleEnum
from app.db.database import get_db

# Every route in this router requires an authenticated admin session.
router = APIRouter(dependencies=[Depends(require_admin_session)])
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def _flash(request: Request, *, success: str | None = None, error: str | None = None) -> None:
    if success:
        request.session["flash_success"] = success
    if error:
        request.session["flash_error"] = error


def _redirect_users() -> RedirectResponse:
    return RedirectResponse(url="/admin/users", status_code=302)


@router.get("/users", response_class=HTMLResponse)
async def users_list(request: Request, db: AsyncSession = Depends(get_db)):
    users = await get_all_users(db)
    return templates.TemplateResponse(
        request,
        "users/list.html",
        {
            "logged_in": True,
            "users": users,
            "flash_success": request.session.pop("flash_success", None),
            "flash_error": request.session.pop("flash_error", None),
        },
    )


@router.get("/users/new", response_class=HTMLResponse)
async def users_new(request: Request):
    return templates.TemplateResponse(
        request,
        "users/create.html",
        {"logged_in": True, "flash_error": request.session.pop("flash_error", None)},
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
    try:
        # Reuse the API schema so the admin path enforces the same email/password rules.
        UserCreate(email=email, name=name, password=password)
        role_enum = RoleEnum(role)
    except ValidationError as exc:
        issues = "; ".join(e["msg"] for e in exc.errors())
        _flash(request, error=f"Invalid input: {issues}")
        return RedirectResponse(url="/admin/users/new", status_code=302)
    except ValueError:
        _flash(request, error=f"Invalid role: {role}")
        return RedirectResponse(url="/admin/users/new", status_code=302)

    try:
        await create_user(db, email=email, name=name, password=password, role=role_enum)
    except HTTPException as exc:
        _flash(request, error=f"Failed to create user: {exc.detail}")
        return RedirectResponse(url="/admin/users/new", status_code=302)

    _flash(request, success=f"Account created for {email}")
    return _redirect_users()


@router.post("/users/{user_id}/verify")
async def users_verify(request: Request, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        await verify_user(db, user_id)
        _flash(request, success="Email verified")
    except HTTPException as exc:
        _flash(request, error=f"Error: {exc.detail}")
    return _redirect_users()


@router.post("/users/{user_id}/block")
async def users_block(request: Request, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        await block_user(db, user_id)
        _flash(request, success="User blocked")
    except HTTPException as exc:
        _flash(request, error=f"Error: {exc.detail}")
    return _redirect_users()


@router.post("/users/{user_id}/unblock")
async def users_unblock(request: Request, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        await unblock_user(db, user_id)
        _flash(request, success="User unblocked")
    except HTTPException as exc:
        _flash(request, error=f"Error: {exc.detail}")
    return _redirect_users()


@router.post("/users/{user_id}/reset-password")
async def users_reset_password(
    request: Request,
    user_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    try:
        await send_password_reset(db, user_id, background_tasks)
        _flash(request, success="Password reset email sent")
    except HTTPException as exc:
        _flash(request, error=f"Error: {exc.detail}")
    return _redirect_users()


@router.post("/users/{user_id}/enable-demo")
async def users_enable_demo(
    request: Request, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    try:
        await enable_demo(db, user_id)
        _flash(request, success="Demo mode enabled")
    except HTTPException as exc:
        _flash(request, error=f"Error: {exc.detail}")
    return _redirect_users()


@router.post("/users/{user_id}/disable-demo")
async def users_disable_demo(
    request: Request, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    try:
        await disable_demo(db, user_id)
        _flash(request, success="Demo mode disabled")
    except HTTPException as exc:
        _flash(request, error=f"Error: {exc.detail}")
    return _redirect_users()


@router.post("/users/{user_id}/delete")
async def users_delete(request: Request, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        await delete_user(db, user_id)
        _flash(request, success="User deleted")
    except HTTPException as exc:
        _flash(request, error=f"Error: {exc.detail}")
    return _redirect_users()
