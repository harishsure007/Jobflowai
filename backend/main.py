# backend/main.py
import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

# -----------------------------
# Load environment (.env files)
# -----------------------------
env_loaded = load_dotenv(dotenv_path=Path("backend/.env"))
if not env_loaded:
    load_dotenv(dotenv_path=Path(".env"))

ENV = os.getenv("ENV", "dev").lower()
AUTO_MIGRATE = os.getenv("AUTO_MIGRATE", "false").strip().lower() == "true"
USE_AUTH_MIDDLEWARE = os.getenv("USE_AUTH_MIDDLEWARE", "false").strip().lower() == "true"

# -----------
# Logging
# -----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# ----------------------------------------
# DB metadata (DEV ONLY: auto-create tables)
# ----------------------------------------
from backend.database import Base, engine  # noqa: E402
from backend import models  # noqa: F401,E402

if ENV == "dev" or AUTO_MIGRATE:
    Base.metadata.create_all(bind=engine)

# -----------
# Routers (module imports)
# -----------
from backend.routes import jobs  # noqa: E402
from backend.routes import auth as auth_routes  # JWT login/signup
from backend.routes.resume_cover import router as resume_cover_router  # noqa: E402
from backend.routes import (  # noqa: E402
    resume_routes,   # short prefix e.g., "/resume"
    generate,        # short prefix e.g., "/generate"
    enhance,         # short prefix e.g., "/enhance"
    compare,         # short prefix e.g., "/compare"
    feedback,        # short prefix e.g., "/feedback"
    auth_reset,      # short prefix e.g., "/auth" (reset/otp)
    parse,           # short prefix e.g., "/parse"
)
from backend.routes.profile import router as profile_router  # noqa: E402
from backend.routes.jobs_debug import router as jobs_debug_router  # noqa: E402
from backend.routes.news import router as news_router  # <-- NEW (RSS → JSON headlines)

# -----------
# CORS
# -----------
DEFAULT_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:3001", "http://127.0.0.1:3001",
]
try:
    from backend.config import ALLOWED_ORIGINS as _ALLOWED_ORIGINS  # noqa: E402
except Exception:
    _ALLOWED_ORIGINS = None

ALLOWED_ORIGINS = _ALLOWED_ORIGINS or DEFAULT_ORIGINS

app = FastAPI(
    title="JobFlowAI API",
    version="1.0.0",
    description="AI-powered resume comparison, enhancement, and interview assistant",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,          # must be explicit when credentials=True
    allow_credentials=True,                 # allow cookies if you ever need them
    allow_methods=["*"],
    allow_headers=["*"],                    # includes Authorization, Content-Type, etc.
    expose_headers=["Content-Type", "Authorization"],
    max_age=600,
)

# ------------------------------------------------
# JWT Auth middleware (toggleable for debugging)
# ------------------------------------------------
if USE_AUTH_MIDDLEWARE:
    try:
        from backend.middleware.auth_middleware import AuthMiddleware
        app.add_middleware(
            AuthMiddleware,
            excluded_paths={
                "/", "/health",
                "/openapi.json", "/docs", "/redoc", "/favicon.ico",

                # Public JWT endpoints
                "/api/v1/auth/login",
                "/api/v1/auth/signup",
                "/api/v1/auth/refresh",

                # Public reset/OTP endpoints (match auth_reset.py)
                "/api/v1/auth/forgot-otp",
                "/api/v1/auth/verify-otp",
                "/api/v1/auth/reset-with-otp",

                # Public generators / news
                "/api/v1/resume-cover",
                "/api/v1/news/jobs",
                # (keep /api/v1/resume-cover/save protected)
            },
        )
        logging.info("AuthMiddleware mounted (USE_AUTH_MIDDLEWARE=true)")
    except Exception as e:
        logging.warning("AuthMiddleware not mounted: %s", e)
else:
    logging.info("AuthMiddleware disabled (USE_AUTH_MIDDLEWARE=false)")

# ------------------------------------------------
# OPTIONAL: log auth header presence
# ------------------------------------------------
@app.middleware("http")
async def log_auth_header(request: Request, call_next):
    auth_present = bool(request.headers.get("authorization"))
    logging.info("REQ %s %s  Auth? %s", request.method, request.url.path, auth_present)
    response = await call_next(request)
    return response

# ------------------------------------------------
# Mount routers (avoid double /api/v1 prefixes)
# ------------------------------------------------
app.include_router(resume_routes.router, prefix="/api/v1")
app.include_router(generate.router,      prefix="/api/v1")
app.include_router(enhance.router,       prefix="/api/v1")
app.include_router(compare.router,       prefix="/api/v1")
app.include_router(feedback.router,      prefix="/api/v1")
app.include_router(parse.router,         prefix="/api/v1")

# Auth (JWT + reset/otp)
# ⬇️ Mount reset/OTP under /api/v1/auth so frontend /auth/* hits /api/v1/auth/*
app.include_router(auth_reset.router,    prefix="/api/v1/auth", tags=["Auth (Reset)"])
app.include_router(auth_routes.router,   prefix="/api/v1",      tags=["Auth (JWT)"])

# Resume/Cover generator — "/resume-cover" (PUBLIC) and "/resume-cover/save" (PROTECTED)
app.include_router(resume_cover_router,  prefix="/api/v1")

# Jobs + profile + debug
app.include_router(jobs.router,          prefix="/api/v1")
app.include_router(profile_router,       prefix="/api/v1")

# News (RSS aggregator)  <-- NEW
app.include_router(news_router)

# jobs_debug_router usually has its own explicit prefix (e.g., "/api/v1/_debug")
app.include_router(jobs_debug_router)

# -----------
# Health & root
# -----------
@app.get("/health")
def health():
    return {"status": "ok", "env": ENV}

@app.get("/")
def root():
    return {"name": "JobFlowAI API", "version": "1.0.0"}

# -----------
# Debug prints on startup
# -----------
print("ENV =", ENV)
print("AUTO_MIGRATE =", AUTO_MIGRATE)
print("RAPIDAPI_KEY present?", bool(os.getenv("RAPIDAPI_KEY")))
print("JSEARCH host/path =", os.getenv("JSEARCH_RAPIDAPI_HOST"), os.getenv("JSEARCH_RAPIDAPI_PATH"))

@app.on_event("startup")
async def list_routes():
    print("\n=== ROUTES ===")
    for r in app.routes:
        if isinstance(r, APIRoute):
            methods = ",".join(sorted(r.methods))
            mod = getattr(r.endpoint, "__module__", "?")
            fn  = getattr(r.endpoint, "__name__", "?")
            print(f"{methods:10s} {r.path:35s}  ->  {mod}.{fn}")
    print("==============\n")
