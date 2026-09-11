from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # Database configuration
    DATABASE_URL: str
    SYNC_DATABASE_URL: str
    TEST_DATABASE_URL: str = ""

    # Authentication
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS — comma-separated string; parse with .cors_origins_list
    CORS_ORIGINS: str = "http://localhost:5173"

    DEBUG: bool = False

    # Admin panel
    ADMIN_USERNAME: str  # required — set via ADMIN_USERNAME env var, no default
    ADMIN_PASSWORD: str
    ADMIN_SECRET: str

    # Email — Mailgun
    MAILGUN_API_KEY: str = ""
    MAILGUN_DOMAIN: str = ""
    MAILGUN_FROM_EMAIL: str = ""
    MAILGUN_FROM_NAME: str = "Simple Project Tool"
    FRONTEND_URL: str = "http://localhost:5173"
    ADMIN_EMAIL: str = ""

    # LLM / natural-language capture
    LLM_PROVIDER: str = "google"
    # gemini-2.5-flash is dead for new API keys (404); gemini-3.6-flash's free tier is capped
    # at 20 req/day, far too low for real use; gemini-3.1-flash-lite verified live with
    # headroom and no reasoning-token overhead
    LLM_MODEL: str = "gemini-3.1-flash-lite"
    GOOGLE_API_KEY: str = ""
    LLM_TIMEOUT_SECONDS: int = 30
    LLM_CAPTURE_MIN_CONFIDENCE: float = 0.5
    # Demo/replay only: pins the "today" the extractor reasons from, so a recorded
    # fixture keeps matching tomorrow. Empty (the default) uses the real date.
    CAPTURE_REFERENCE_DATE: str = ""
    LLM_ALLOW_SERVER_KEY_FALLBACK: bool = True
    LLM_MAX_RPM: int = 20
    LLM_MAX_TPM: int = 100_000

    # Credential encryption — Fernet key for encrypting user-supplied LLM API keys at rest.
    # Dedicated from SECRET_KEY: rotating SECRET_KEY must not brick stored credentials.
    # Empty disables BYO credentials.
    CREDENTIAL_ENCRYPTION_KEY: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
