# backend/migrations/env.py
from __future__ import annotations

from logging.config import fileConfig
import os
import sys

from alembic import context
from sqlalchemy import engine_from_config, pool

# -------------------------------------------------------------------
# Make the project root importable so "import backend.XXX" works
# when running Alembic from the repository root.
# This file lives at backend/migrations/env.py, so go up two levels.
# -------------------------------------------------------------------
CURRENT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

# (Optional) load backend/.env so you can keep secrets out of alembic.ini
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join("backend", ".env"))
except Exception:
    pass

# -------------------------------------------------------------------
# Import the SAME Base your models subclass
# -------------------------------------------------------------------
from backend.database import Base  # Base is defined in backend/database.py

# IMPORTANT: Import models so tables register on Base.metadata
# (Side-effect import — do not remove)
import backend.models  # noqa: F401

# Alembic Config object, provides access to values in alembic.ini
config = context.config

# Allow overriding sqlalchemy.url via env var to avoid hardcoding secrets:
#  - ALEMBIC_DATABASE_URL (preferred)
#  - DATABASE_URL_SYNC (fallback)
env_url = os.getenv("ALEMBIC_DATABASE_URL") or os.getenv("DATABASE_URL_SYNC")
if env_url:
    config.set_main_option("sqlalchemy.url", env_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for ‘--autogenerate’
target_metadata = Base.metadata

# Optional: set these via env if you ever use non-default schemas
VERSION_TABLE = os.getenv("ALEMBIC_VERSION_TABLE", "alembic_version")
VERSION_TABLE_SCHEMA = os.getenv("ALEMBIC_VERSION_SCHEMA")  # e.g. "public" or another schema name


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        compare_server_default=True,
        version_table=VERSION_TABLE,
        version_table_schema=VERSION_TABLE_SCHEMA,
        # include_schemas=True,  # enable if you manage multiple schemas
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (with DB connection)."""
    # Some Alembic installs can return None here; guard for that.
    section = config.get_section(config.config_ini_section) or {}
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            version_table=VERSION_TABLE,
            version_table_schema=VERSION_TABLE_SCHEMA,
            # include_schemas=True,  # enable if you manage multiple schemas
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
