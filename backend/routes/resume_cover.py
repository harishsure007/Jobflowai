# backend/routes/resume_cover.py
from __future__ import annotations

import os
import re
import textwrap
import datetime as _dt
from typing import Optional, Any

from fastapi import APIRouter, HTTPException, Depends, Body, Header
from sqlalchemy.orm import Session

from backend.database import get_db, SessionLocal
from backend.models import Profile, User, Resume

# =========================
#   BLANK-LINE NORMALIZER
# =========================
try:
    from backend.utils.text_normalize import squeeze_blank_lines  # optional helper if you have it
except Exception:
    def squeeze_blank_lines(s: str) -> str:
        out = []
        prev_blank = False
        for ln in (s or "").splitlines():
            cur_blank = (ln.strip() == "")
            if cur_blank and prev_blank:
                continue
            out.append(ln)
            prev_blank = cur_blank
        return "\n".join(out).strip()

# =========================
#      DIRECT JWT AUTH
# =========================
try:
    import jwt  # PyJWT
except Exception as e:
    raise RuntimeError("PyJWT is required. Install with: pip install PyJWT") from e

JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY")
JWT_ALGO = os.getenv("JWT_ALGO", "HS256")
if not JWT_SECRET:
    # Fail fast with a clear error so you don't debug 401s forever
    raise RuntimeError("JWT_SECRET (or SECRET_KEY) is missing in environment variables.")

def get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split()[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub") or payload.get("user_id")
    email = payload.get("email")

    user: Optional[User] = None
    if user_id is not None:
        try:
            user = db.query(User).filter(User.id == int(user_id)).first()
        except Exception:
            user = None
    if not user and email:
        user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user

# ⬇️ Optional auth for PUBLIC generator (lazy; no DB unless token present)
def get_optional_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> Optional[User]:
    """
    Return User if a valid Bearer token is present; otherwise None.
    Never raises—keeps /resume-cover public. Opens a DB session ONLY when a token exists.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None

    token = authorization.split()[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        return None

    user_id = payload.get("sub") or payload.get("user_id")
    email = payload.get("email")

    db = SessionLocal()
    try:
        user: Optional[User] = None
        if user_id is not None:
            try:
                user = db.query(User).filter(User.id == int(user_id)).first()
            except Exception:
                user = None
        if not user and email:
            user = db.query(User).filter(User.email == email).first()
        return user
    finally:
        db.close()

# =========================
#   OPTIONAL OPENAI CLIENT
# =========================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
USE_AI = bool(OPENAI_API_KEY)  # only try remote if key is present

try:
    from openai import OpenAI
    _openai_available = True
except Exception:
    _openai_available = False
    USE_AI = False

def _openai_client() -> Optional[Any]:
    if not (USE_AI and _openai_available):
        return None
    try:
        return OpenAI(api_key=OPENAI_API_KEY)
    except Exception:
        return None

def _call_openai(system_prompt: str, user_prompt: str) -> str:
    """
    Calls OpenAI if available; otherwise uses a local fallback.
    Any exception falls back to local.
    """
    client = _openai_client()
    if not client:
        return _local_fallback(system_prompt, user_prompt)
    try:
        resp = client.chat.completions.create(
            model=os.getenv("DEFAULT_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            max_tokens=1400,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return _local_fallback(system_prompt, user_prompt)

def _local_fallback(system_prompt: str, user_prompt: str) -> str:
    # Extract contact block from user_prompt
    contact = ""
    if "CONTACT BLOCK" in user_prompt:
        after = user_prompt.split("CONTACT BLOCK", 1)[1].lstrip("\n")
        lines = []
        for ln in after.splitlines():
            if not ln.strip():
                break
            lines.append(ln)
        contact = "\n".join(lines)

    if "resume writer" in system_prompt.lower():
        body = textwrap.dedent("""
        ## Professional Summary
        Results-driven professional aligned to the role with quantified wins.

        ## Core Skills
        - Skill A • Skill B • Skill C

        ## Experience
        Company — Title | Dates
        - Impact bullet with metric
        - Impact bullet with metric

        ## Projects
        - Project with result

        ## Education
        Degree — School | Year
        """).strip()
        return (contact + ("\n\n" + body if body else "")).strip()
    else:
        today = _dt.date.today().strftime("%B %d, %Y")
        name = contact.splitlines()[0].strip() if contact else ""
        body = textwrap.dedent(f"""
        {today}

        Dear Hiring Manager,

        I'm excited to apply for this role. I bring relevant achievements with measurable outcomes.
        - Example: Improved X by Y% by doing Z.

        Sincerely,
        {name}
        """).strip()
        return (contact + ("\n\n" + body if body else "")).strip()

# =========================
#   PROFILE / CONTACT BLOCK
# =========================
def _safe_join(*parts: Optional[str], sep: str = " | ") -> str:
    vals = [p.strip() for p in parts if p and str(p).strip()]
    return sep.join(vals)

def _format_contact_block(profile: Optional[Profile], user: User) -> str:
    full_name = (getattr(profile, "full_name", None) or getattr(profile, "name", None) or user.email.split("@")[0]).strip()
    email     = (getattr(profile, "email", None) or getattr(user, "email", "") or "").strip()
    phone     = (getattr(profile, "phone", None) or "").strip()

    city      = (getattr(profile, "city", None) or "").strip()
    state     = (getattr(profile, "state", None) or "").strip()
    location  = ", ".join([p for p in (city, state) if p])

    linkedin  = (getattr(profile, "linkedin", None) or "").strip()
    github    = (getattr(profile, "github", None) or "").strip()
    links     = _safe_join(linkedin, github)

    lines = [full_name]
    if location: lines.append(location)
    if phone:    lines.append(phone)
    if email:    lines.append(email)
    if links:    lines.append(links)

    return "\n".join([ln for ln in lines if ln.strip()]).strip()

def _fetch_profile(db: Session, user_id: int) -> Optional[Profile]:
    return db.query(Profile).filter(Profile.user_id == user_id).first()

# =========================
#   POST-PROCESS SAFETY
# =========================
_PLACEHOLDER_LINES = {
    "your name", "you@example.com", "city, st",
    "linkedin.com/in/example", "github.com/example", "000-000-0000"
}

def _strip_placeholder_header(text: str) -> str:
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        low = lines[i].strip().lower()
        if not low:
            i += 1
            continue
        if any(tok in low for tok in _PLACEHOLDER_LINES):
            i += 1
            continue
        break
    return "\n".join(lines[i:]).lstrip()

def _force_contact_on_top(contact_block: str, content: str) -> str:
    content = content.strip()
    content = _strip_placeholder_header(content)
    if content.startswith(contact_block):
        return content
    body = content.replace(contact_block, "").strip()
    return (contact_block + "\n\n" + body).strip()

def _normalize_inline(s: str) -> str:
    return re.sub(r"\W+", "", s or "").lower()

def _dedupe_contact_block(contact_block: str, content: str) -> str:
    content = content.strip()
    if not contact_block or not content.startswith(contact_block):
        return content

    contact_lines = [ln.strip() for ln in contact_block.splitlines() if ln.strip()]
    name = contact_lines[0] if contact_lines else ""
    phone = next((ln for ln in contact_lines if re.search(r"\d", ln)), "")
    email = next((ln for ln in contact_block.splitlines() if "@" in ln), "")

    body = content[len(contact_block):].lstrip("\n")
    if not body:
        return content

    parts = body.split("\n\n", 1)
    head = parts[0]
    tail = parts[1] if len(parts) > 1 else ""

    head_norm = _normalize_inline(head)
    signals = [_normalize_inline(s) for s in (name, phone, email) if s]
    if any(sig and sig in head_norm for sig in signals):
        new_body = tail.strip()
        return (contact_block + ("\n\n" + new_body if new_body else "")).strip()

    return content

# =========================
#        ROUTER
# =========================
router = APIRouter(tags=["Resume & Cover Generator"])

@router.post("/resume-cover")
def generate_resume_cover(
    payload: dict = Body(...),            # 👈 accept plain dict to avoid model parsing issues
    user: Optional[User] = Depends(get_optional_user),  # PUBLIC (no DB dependency)
):
    """
    Public: Generates resume and/or cover text.
    If a valid JWT is provided, we inject the user's Profile contact block at top.
    If no JWT, we skip contact block (avoids placeholders).
    """
    try:
        # Read inputs defensively
        doc_type = str(payload.get("doc_type", "both")).lower()
        role = (payload.get("role_or_target")
                or payload.get("role")
                or payload.get("targetRole")
                or payload.get("title")
                or "").strip()
        guidance = (payload.get("guidance")
                    or payload.get("jobDescription")
                    or payload.get("jd")
                    or payload.get("notes")
                    or "").strip()
        company = (payload.get("company")
                   or payload.get("companyName")
                   or payload.get("employer")
                   or "").strip()
        include_contact = bool(payload.get("include_contact", True))

        if not role:
            raise HTTPException(status_code=422, detail="role_or_target is required")

        # Only touch DB if there is an authenticated user AND contact injection is requested
        profile: Optional[Profile] = None
        if user and include_contact:
            db = SessionLocal()
            try:
                profile = _fetch_profile(db, user.id)
            finally:
                db.close()

        contact_block = _format_contact_block(profile, user) if (user and profile and include_contact) else ""

        today_str = _dt.date.today().strftime("%B %d, %Y")  # for cover date line

        resume_text: Optional[str] = None
        cover_text: Optional[str] = None

        # Decide targets
        target = doc_type if doc_type in ("resume", "cover", "both") else "both"

        # Build prompts and generate text
        if target in ("resume", "both"):
            u_prompt = (
                "CONTACT BLOCK\n"
                f"{contact_block}\n\n"
                "ROLE / FOCUS\n"
                f"{role}\n\n"
                "GUIDANCE (optional from user/job posting)\n"
                f"{guidance or '(none)'}\n\n"
                "OUTPUT RULES\n"
                "- Put the CONTACT BLOCK at the very top, unchanged.\n"
                "- Do not reprint the contact block; use it once at the very top.\n"
                "- Use sections like: Professional Summary, Core Skills, Experience, Projects, Education, Certifications, Links (only if provided).\n"
                "- Quantify achievements with metrics where plausible.\n"
                "- Avoid any placeholder like 'Your Name', 'you@example.com', 'City, ST'.\n"
            )
            raw = _call_openai(
                "You are an expert resume writer. Create an ATS-friendly, well-structured resume. "
                "Use concise bullets with measurable impact. Avoid placeholders. If a CONTACT BLOCK is given, "
                "use it exactly as-is at the top. Keep formatting clean and readable. "
                "Never invent employers, dates, or credentials. If unsure, keep it high level and omit specifics.",
                u_prompt,
            )
            resume_text = _force_contact_on_top(contact_block, raw) if contact_block else raw
            resume_text = _dedupe_contact_block(contact_block, resume_text)
            resume_text = squeeze_blank_lines(resume_text)

        if target in ("cover", "both"):
            u_prompt = (
                "CONTACT BLOCK\n"
                f"{contact_block}\n\n"
                f"{today_str}\n\n"
                "TARGET ROLE / COMPANY\n"
                f"Role: {role}\n"
                f"Company (if known): {company or '(not specified)'}\n\n"
                "GUIDANCE (optional from user/job posting)\n"
                f"{guidance or '(none)'}\n\n"
                "OUTPUT RULES\n"
                f"- Start with the contact block (unchanged), then date ({today_str}), then greeting (avoid generic greetings if any name/company provided).\n"
                "- Do not reprint the contact block; use it once at the very top.\n"
                "- 3–5 short paragraphs. Show relevant achievements with metrics.\n"
                "- Close with a short, confident sign-off using the name from the contact block.\n"
                "- No placeholders like 'Your Name'.\n"
            )
            raw = _call_openai(
                "You are an expert cover letter writer. Create a tailored, one-page cover letter with a professional tone. "
                "Avoid placeholders. If a CONTACT BLOCK is given, place it at top. "
                "Never invent employers, dates, or credentials. If unsure, keep it high level and omit specifics.",
                u_prompt,
            )
            cover_text = _force_contact_on_top(contact_block, raw) if contact_block else raw
            cover_text = _dedupe_contact_block(contact_block, cover_text)
            cover_text = squeeze_blank_lines(cover_text)

        return {
            "ok": True,
            "doc_type": target,
            "resume_text": resume_text,
            "cover_text": cover_text,
            "model_used": ("openai" if USE_AI else "local-fallback"),
            "timestamp": _dt.datetime.utcnow().isoformat() + "Z",
        }

    except HTTPException:
        raise
    except Exception as e:
        # Help you debug 500s quickly
        raise HTTPException(status_code=500, detail=f"Generator error: {e!s}")

# =========================
#        SAVE ROUTE
# =========================
@router.post("/resume-cover/save")
def save_resume_cover(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),   # PROTECTED
):
    """
    Save resume and/or cover into the Resume table (same store for both),
    labeled via `source` so 'My Resumes' can show both.
    """
    doc_type = str(payload.get("doc_type", "resume")).lower()

    resume_id: Optional[int] = None
    cover_id: Optional[int] = None

    # Save resume row
    if doc_type in ("resume", "both"):
        resume_title = (payload.get("resume_title") or "").strip()
        resume_text = (payload.get("resume_text") or "").strip()
        if not resume_title or not resume_text:
            raise HTTPException(status_code=422, detail="Missing resume_title or resume_text")
        r = Resume(
            title=resume_title,
            content=resume_text,
            source="resume",
            user_id=user.id,
        )
        db.add(r); db.commit(); db.refresh(r)
        resume_id = r.id

    # Save cover row
    if doc_type in ("cover", "both"):
        cover_title = (payload.get("cover_title") or "").strip()
        cover_text = (payload.get("cover_text") or "").strip()
        if not cover_title or not cover_text:
            raise HTTPException(status_code=422, detail="Missing cover_title or cover_text")
        c = Resume(
            title=cover_title,
            content=cover_text,
            source="cover",
            user_id=user.id,
        )
        db.add(c); db.commit(); db.refresh(c)
        cover_id = c.id

    return {"ok": True, "resume_id": resume_id, "cover_id": cover_id}
