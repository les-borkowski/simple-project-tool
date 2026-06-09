from pathlib import Path

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.auth import is_admin_session, require_admin_session, verify_admin_credentials
from app.admin.services import get_totals, get_weekly_trends
from app.admin.users_router import router as users_router
from app.db.database import get_db

router = APIRouter()
router.include_router(users_router)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if is_admin_session(request):
        return RedirectResponse(url="/admin", status_code=302)
    return templates.TemplateResponse(request, "login.html", {"logged_in": False, "error": None})


@router.post("/login")
async def login_submit(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    if verify_admin_credentials(username, password):
        request.session["admin"] = True
        return RedirectResponse(url="/admin", status_code=302)
    return templates.TemplateResponse(
        request, "login.html", {"logged_in": False, "error": "Invalid credentials"}, status_code=401
    )


@router.get("", response_class=HTMLResponse, dependencies=[Depends(require_admin_session)])
async def dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    totals = await get_totals(db)
    trends = await get_weekly_trends(db)
    return templates.TemplateResponse(
        request, "dashboard.html", {"logged_in": True, "totals": totals, "trends": trends}
    )


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/admin/login", status_code=302)
