import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.invitation import InvitationCreate, InvitationResponse
from app.auth.permissions import require_manager, require_project_access
from app.db.base import InvitationStatusEnum, RoleEnum
from app.db.models import Invitation, Project, ProjectMember, User


def _to_response(inv: Invitation) -> InvitationResponse:
    return InvitationResponse(
        id=inv.id,
        project_id=inv.project_id,
        project_name=inv.project.name,
        invitee_email=inv.invitee_email,
        inviter_name=inv.inviter.name,
        role=inv.role,
        status=inv.status,
        created_at=inv.created_at,
        expires_at=inv.expires_at,
    )


async def list_project_invitations(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> list[InvitationResponse]:
    """List pending invitations for a project. Only managers can view."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = await require_project_access(user, project_id, db)
    require_manager(role)

    stmt = (
        select(Invitation)
        .where(Invitation.project_id == project_id)
        .options(selectinload(Invitation.project), selectinload(Invitation.inviter))
    )
    invitations = (await db.scalars(stmt)).all()

    return [_to_response(inv) for inv in invitations]


async def create_invitation(
    project_id: uuid.UUID, data: InvitationCreate, user: User, db: AsyncSession
) -> InvitationResponse:
    """Create an invitation to a project. Only managers can invite."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = await require_project_access(user, project_id, db)
    require_manager(role)

    # Check for existing pending invitation
    stmt = select(Invitation).where(
        and_(
            Invitation.project_id == project_id,
            Invitation.invitee_email == data.invitee_email,
            Invitation.status == InvitationStatusEnum.pending,
        )
    )
    existing = await db.scalar(stmt)
    if existing:
        raise HTTPException(status_code=409, detail="Pending invitation already exists")

    invitation = Invitation(
        project_id=project_id,
        inviter_id=user.id,
        invitee_email=data.invitee_email,
        role=RoleEnum.contributor,
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=7),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation, ["project", "inviter"])

    return _to_response(invitation)


async def cancel_invitation(invitation_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Cancel an invitation. Only the manager who created it can cancel."""
    invitation = await db.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    role = await require_project_access(user, invitation.project_id, db)
    require_manager(role)

    await db.delete(invitation)
    await db.commit()


async def accept_invitation(invitation_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Accept an invitation."""
    invitation = await db.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.invitee_email != user.email:
        raise HTTPException(status_code=403, detail="Invitation email does not match your account")

    if invitation.status != InvitationStatusEnum.pending:
        raise HTTPException(status_code=409, detail="You have already responded to this invitation")

    if datetime.now(UTC).replace(tzinfo=None) > invitation.expires_at:
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # Create ProjectMember
    member = ProjectMember(project_id=invitation.project_id, user_id=user.id, role=invitation.role)
    db.add(member)

    # Update invitation status
    invitation.status = InvitationStatusEnum.accepted
    await db.commit()


async def decline_invitation(invitation_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Decline an invitation."""
    invitation = await db.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.invitee_email != user.email:
        raise HTTPException(status_code=403, detail="Invitation email does not match your account")

    if invitation.status != InvitationStatusEnum.pending:
        raise HTTPException(status_code=409, detail="You have already responded to this invitation")

    invitation.status = InvitationStatusEnum.declined
    await db.commit()


async def list_my_invitations(user: User, db: AsyncSession) -> list[InvitationResponse]:
    """List pending invitations for the current user."""
    stmt = (
        select(Invitation)
        .where(
            and_(
                Invitation.invitee_email == user.email,
                Invitation.status == InvitationStatusEnum.pending,
            )
        )
        .options(selectinload(Invitation.project), selectinload(Invitation.inviter))
    )
    invitations = (await db.scalars(stmt)).all()

    return [_to_response(inv) for inv in invitations]
