import os
import datetime as dt
import jwt
import logging
from fastapi import Header, HTTPException
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

# Standardized JWT secret handling (used across all auth modules)
JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET (or SECRET_KEY) env var is required but not set.")
JWT_ALG = "HS256"
JWT_EXPIRE_SECONDS = 60 * 60 * 24  # 24h

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return _pwd.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)

def create_access_token(sub: str, extra: dict | None = None) -> str:
    payload = {"sub": sub, "exp": dt.datetime.utcnow() + dt.timedelta(seconds=JWT_EXPIRE_SECONDS)}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def decode_bearer(Authorization: str | None = Header(None)) -> dict:
    if not Authorization or not Authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = Authorization.split(" ", 1)[1].strip()
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
