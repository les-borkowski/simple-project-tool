from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class CommentCreate(BaseModel):
    body: str


class CommentUpdate(BaseModel):
    body: str


class CommentResponse(BaseModel):
    id: UUID
    body: str
    author_id: UUID
    author_name: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
