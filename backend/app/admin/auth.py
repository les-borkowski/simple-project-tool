from starlette.requests import Request

from app.core.config import settings


def verify_admin_credentials(username: str, password: str) -> bool:
    return username == settings.ADMIN_USERNAME and password == settings.ADMIN_PASSWORD


def is_admin_session(request: Request) -> bool:
    return bool(request.session.get("admin"))
