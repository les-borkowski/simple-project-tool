import uuid
from datetime import UTC, datetime, timedelta
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.auth.permissions import require_project_access, require_manager
from app.db.models import Invitation, Project, ProjectMember, User
from app.db.base import InvitationStatusEnum, RoleEnum
from app.api.schemas.invitation import InvitationCreate, InvitationResponse


async def list_project_invitations(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> list[InvitationResponse]:
    """List pending invitations for a project. Only managers can view."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = await require_project_access(user, project_id, db)
    require_manager(role)

    stmt = select(Invitation).where(Invitation.project_id == project_id)
    invitations = (await db.scalars(stmt)).all()

    return [InvitationResponse.model_validate(inv) for inv in invitations]


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
        role=data.role,
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=7),
    )
    db.add(invitation)
    await db.commit()

    return InvitationResponse.model_validate(invitation)


async def cancel_invitation(
    invitation_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    """Cancel an invitation. Only the manager who created it can cancel."""
    invitation = await db.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    role = await require_project_access(user, invitation.project_id, db)
    require_manager(role)

    await db.delete(invitation)
    await db.commit()


async def accept_invitation(
    invitation_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    """Accept an invitation."""
    invitation = await db.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.invitee_email != user.email:
        raise HTTPException(status_code=403, detail="Invitation email does not match your account")

    if invitation.status != InvitationStatusEnum.pending:
        raise HTTPException(
            status_code=409, detail="You have already responded to this invitation"
        )

    if datetime.now(UTC).replace(tzinfo=None) > invitation.expires_at:
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # Create ProjectMember
    member = ProjectMember(
        project_id=invitation.project_id, user_id=user.id, role=invitation.role
    )
    db.add(member)

    # Update invitation status
    invitation.status = InvitationStatusEnum.accepted
    await db.commit()


async def decline_invitation(
    invitation_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    """Decline an invitation."""
    invitation = await db.get(Invitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.invitee_email != user.email:
        raise HTTPException(status_code=403, detail="Invitation email does not match your account")

    if invitation.status != InvitationStatusEnum.pending:
        raise HTTPException(
            status_code=409, detail="You have already responded to this invitation"
        )

    invitation.status = InvitationStatusEnum.declined
    await db.commit()


async def list_my_invitations(user: User, db: AsyncSession) -> list[InvitationResponse]:
    """List pending invitations for the current user."""
    stmt = select(Invitation).where(
        and_(
            Invitation.invitee_email == user.email,
            Invitation.status == InvitationStatusEnum.pending,
        )
    )
    invitations = (await db.scalars(stmt)).all()

    return [InvitationResponse.model_validate(inv) for inv in invitations]
