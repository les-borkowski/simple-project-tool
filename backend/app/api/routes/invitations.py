import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.invitation import InvitationCreate, InvitationResponse
from app.api.services import invitation_service
from app.auth.dependencies import get_current_user
from app.core.email import send_invitation_email
from app.db.database import get_db
from app.db.models import User

router = APIRouter(tags=["invitations"])


@router.get("/projects/{project_id}/invitations", response_model=list[InvitationResponse])
async def list_project_invitations(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List invitations for a project."""
    return await invitation_service.list_project_invitations(project_id, user, db)


@router.post(
    "/projects/{project_id}/invitations",
    response_model=InvitationResponse,
    status_code=201,
)
async def create_invitation(
    project_id: uuid.UUID,
    data: InvitationCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an invitation. Sends notification email to the invitee."""
    inv = await invitation_service.create_invitation(project_id, data, user, db)
    background_tasks.add_task(
        send_invitation_email,
        inv.invitee_email,
        inv.inviter_name,
        inv.project_name,
        inv.role.value,
    )
    return inv


@router.get("/invitations/mine", response_model=list[InvitationResponse])
async def list_my_invitations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List my pending invitations."""
    return await invitation_service.list_my_invitations(user, db)


@router.delete("/invitations/{invitation_id}", status_code=204)
async def cancel_invitation(
    invitation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an invitation."""
    await invitation_service.cancel_invitation(invitation_id, user, db)


@router.post("/invitations/{invitation_id}/accept", status_code=204)
async def accept_invitation(
    invitation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept an invitation."""
    await invitation_service.accept_invitation(invitation_id, user, db)


@router.post("/invitations/{invitation_id}/decline", status_code=204)
async def decline_invitation(
    invitation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Decline an invitation."""
    await invitation_service.decline_invitation(invitation_id, user, db)
