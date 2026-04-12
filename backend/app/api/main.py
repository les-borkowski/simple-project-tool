import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.db.database import engine
from app.api.routes import (
    auth,
    projects,
    stories,
    tasks,
    comments,
    invitations,
    time_tracking,
    config,
)

# Global locales dict
LOCALES: dict[str, dict] = {}


def get_locale(request: Request) -> str:
    """Get locale from request state or default."""
    return getattr(request.state, "locale", "en-GB")


def translate(request: Request, code: str) -> str:
    """Translate an error code based on request locale."""
    locale = get_locale(request)
    return LOCALES.get(locale, LOCALES.get("en-GB", {})).get(code, code)


async def check_db_connection():
    """Check if database connection is working."""
    try:
        async with engine.begin() as conn:
            await conn.execute("SELECT 1")
        print("✓ Database connection successful")
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    # Load locales on startup
    locales_dir = Path(__file__).parent.parent / "locales"
    for locale_file in sorted(locales_dir.glob("*.json")):
        with open(locale_file) as f:
            LOCALES[locale_file.stem] = json.load(f)
    print(f"✓ Loaded locales: {', '.join(LOCALES.keys())}")

    # Check database connection
    await check_db_connection()

    yield

    # Cleanup on shutdown
    await engine.dispose()
    print("✓ Shutdown complete")


app = FastAPI(
    title="simple-project-tool",
    description="Minimalist project management API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Accept-Language middleware → request.state.locale
@app.middleware("http")
async def locale_middleware(request: Request, call_next):
    """Extract Accept-Language header and set request.state.locale."""
    lang_header = request.headers.get("Accept-Language", "en-GB")
    # Parse Accept-Language: take first language before comma or semicolon
    lang = lang_header.split(",")[0].strip().split(";")[0].strip()
    request.state.locale = lang if lang in LOCALES else "en-GB"
    return await call_next(request)


# Exception handlers


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Convert HTTPException to standard error format."""
    error_code = exc.detail if isinstance(exc.detail, str) else "INTERNAL_ERROR"
    error_msg = translate(request, error_code) if isinstance(exc.detail, str) else str(
        exc.detail
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": error_code,
                "message": error_msg,
                "details": [],
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Convert validation errors to standard error format."""
    from fastapi.responses import JSONResponse

    details = []
    for error in exc.errors():
        field = ".".join(str(x) for x in error["loc"][1:]) if len(error["loc"]) > 1 else None
        details.append({"field": field, "issue": error["msg"]})

    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": translate(request, "FIELD_REQUIRED"),
                "details": details,
            }
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Catch-all for unexpected errors."""
    from fastapi.responses import JSONResponse
    import traceback

    print(f"Unexpected error: {exc}")
    traceback.print_exc()

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Internal server error",
                "details": [],
            }
        },
    )


# Health check
@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# API routes
app.include_router(auth.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(stories.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(comments.router, prefix="/api/v1")
app.include_router(invitations.router, prefix="/api/v1")
app.include_router(time_tracking.router, prefix="/api/v1")
app.include_router(config.router, prefix="/api/v1")
