import re
from uuid import UUID
from pydantic import BaseModel, field_validator


class ProjectStatusCreate(BaseModel):
    slug: str
    name: str
    colour: str
    order: int

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9_]+$", v):
            raise ValueError("slug must contain only lowercase letters, numbers, and underscores")
        return v

    @field_validator("colour")
    @classmethod
    def colour_format(cls, v: str) -> str:
        if not re.match(r"^#[0-9a-fA-F]{6}$", v):
            raise ValueError("colour must be a 6-digit hex string like #3b82f6")
        return v


class ProjectStatusUpdate(BaseModel):
    name: str | None = None
    colour: str | None = None
    order: int | None = None

    @field_validator("colour")
    @classmethod
    def colour_format(cls, v: str | None) -> str | None:
        if v is not None and not re.match(r"^#[0-9a-fA-F]{6}$", v):
            raise ValueError("colour must be a 6-digit hex string like #3b82f6")
        return v


class ProjectStatusResponse(BaseModel):
    id: UUID
    project_id: UUID
    slug: str
    name: str
    colour: str
    order: int

    class Config:
        from_attributes = True
