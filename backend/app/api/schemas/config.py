from pydantic import BaseModel
from app.db.base import ThemeEnum, LocaleEnum


class UserConfigResponse(BaseModel):
    theme: ThemeEnum
    locale: LocaleEnum
    display_preferences: dict

    class Config:
        from_attributes = True


class UserConfigUpdate(BaseModel):
    theme: ThemeEnum | None = None
    locale: LocaleEnum | None = None
    display_preferences: dict | None = None
