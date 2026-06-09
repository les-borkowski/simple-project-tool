import hmac

from starlette.requests import Request

from app.core.config import settings


def verify_admin_credentials(username: str, password: str) -> bool:
    return hmac.compare_digest(username, settings.ADMIN_USERNAME) and hmac.compare_digest(
        password, settings.ADMIN_PASSWORD
    )


def is_admin_session(request: Request) -> bool:
    return bool(request.session.get("admin"))


class AdminAuthRequired(Exception):
    """Raised when an admin-panel route is accessed without a valid session.

    Handled by an exception handler that redirects to the admin login page.
    """


def require_admin_session(request: Request) -> None:
    """FastAPI dependency that enforces an authenticated admin session."""
    if not is_admin_session(request):
        raise AdminAuthRequired()
