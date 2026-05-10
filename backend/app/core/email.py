import logging
from pathlib import Path

import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

logger = logging.getLogger(__name__)

_template_dir = Path(__file__).parent.parent / "templates" / "emails"
_env = Environment(
    loader=FileSystemLoader(str(_template_dir)),
    autoescape=select_autoescape(["html"]),
)


async def send_email(to: str, subject: str, html: str) -> None:
    if not settings.MAILGUN_API_KEY:
        logger.warning("Mailgun not configured; skipping email to %s", to)
        return
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.mailgun.net/v3/{settings.MAILGUN_DOMAIN}/messages",
            auth=("api", settings.MAILGUN_API_KEY),
            data={
                "from": f"{settings.MAILGUN_FROM_NAME} <{settings.MAILGUN_FROM_EMAIL}>",
                "to": to,
                "subject": subject,
                "html": html,
            },
        )
        resp.raise_for_status()


async def send_confirmation_email(to_email: str, name: str, token: str) -> None:
    url = f"{settings.FRONTEND_URL}/auth/confirm-email?token={token}"
    html = _env.get_template("confirmation.html").render(name=name, confirmation_url=url)
    await send_email(to_email, "Confirm your email address", html)


async def send_password_reset_email(to_email: str, name: str, token: str) -> None:
    url = f"{settings.FRONTEND_URL}/auth/reset-password?token={token}"
    html = _env.get_template("password_reset.html").render(name=name, reset_url=url)
    await send_email(to_email, "Reset your password", html)


async def send_admin_new_user_notification(user_email: str, user_name: str) -> None:
    if not settings.ADMIN_EMAIL:
        return
    html = _env.get_template("admin_new_user.html").render(email=user_email, name=user_name)
    await send_email(settings.ADMIN_EMAIL, "New user registered", html)


async def send_invitation_email(
    to_email: str, inviter_name: str, project_name: str, role: str
) -> None:
    html = _env.get_template("invitation.html").render(
        inviter_name=inviter_name,
        project_name=project_name,
        role=role,
        app_url=settings.FRONTEND_URL,
    )
    await send_email(to_email, f"You've been invited to {project_name}", html)
