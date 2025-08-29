# backend/routes/resume_cover.py
from __future__ import annotations

import os
import re
import textwrap
import datetime as _dt
from typing import Optional, Literal, Any

from fastapi import APIRouter, HTTPException, Depends, Body, Header
from pydantic import BaseModel, Field, AliasChoices
from pydantic.config import ConfigDict
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Profile, User  # adjust import paths if your project differs

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

# =========================
#   OPTIONAL OPENAI CLIENT
# =========================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
try:
    from openai import OpenAI
    _openai_available = True
except Exception:
    _openai_available = False

def _openai_client() -> Optional[Any]:
    if not (OPENAI_API_KEY and _openai_available):
        return None
    return OpenAI(api_key=OPENAI_API_KEY)

def _call_openai(system_prompt: str, user_prompt: str) -> str:
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
        return (contact + "\n\n" + body).strip()
    else:
        # Use today's date in local fallback too (cover letter)
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
        return (contact + "\n\n" + body).strip()

# =========================
#         PROMPTS
# =========================
RESUME_SYSTEM = """You are an expert resume writer. Create an ATS-friendly, well-structured resume.
Use concise bullets with measurable impact. Avoid placeholders. If a CONTACT BLOCK is given,
use it exactly as-is at the top. Keep formatting clean and readable.
Never invent employers, dates, or credentials. If unsure, keep it high level and omit specifics.
"""

RESUME_USER_TMPL = """CONTACT BLOCK
{CONTACT_BLOCK}

ROLE / FOCUS
{role_or_target}

GUIDANCE (optional from user/job posting)
{guidance}

OUTPUT RULES
- Put the CONTACT BLOCK at the very top, unchanged.
- Do not reprint the contact block; use it once at the very top.
- Use sections like: Professional Summary, Core Skills, Experience, Projects, Education, Certifications, Links (only if provided).
- Quantify achievements with metrics where plausible.
- Avoid any placeholder like "Your Name", "you@example.com", "City, ST".
"""

COVER_SYSTEM = """You are an expert cover letter writer. Create a tailored, one-page cover letter
with a professional tone. Avoid placeholders. If a CONTACT BLOCK is given, place it at top.
Never invent employers, dates, or credentials. If unsure, keep it high level and omit specifics.
"""

# NOTE: include a {TODAY} placeholder so OpenAI versions also stamp today's date.
COVER_USER_TMPL = """CONTACT BLOCK
{CONTACT_BLOCK}

{TODAY}

TARGET ROLE / COMPANY
Role: {role_or_target}
Company (if known): {company}

GUIDANCE (optional from user/job posting)
{guidance}

OUTPUT RULES
- Start with the contact block (unchanged), then date ({TODAY}), then greeting (avoid "To Whom It May Concern" if any name/company provided).
- Do not reprint the contact block; use it once at the very top.
- 3–5 short paragraphs. Show relevant achievements with metrics.
- Close with a short, confident sign-off using the name from the contact block.
- No placeholders like "Your Name".
"""

# =========================
#         SCHEMAS
# =========================
DocType = Literal["resume", "cover", "both", "auto"]

class GenerateRequest(BaseModel):
    """
    Accept both snake_case and camelCase (and common variants) from clients.
    Unknown/extra fields are ignored to avoid 422s from harmless UI props.
    """
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    doc_type: DocType = Field(
        "both",
        description="resume|cover|both|auto",
        validation_alias=AliasChoices(
            "doc_type", "docType", "type", "documentType"
        ),
    )
    role_or_target: str = Field(
        ...,
        min_length=2,
        description="Target role, e.g., 'Data Analyst'",
        validation_alias=AliasChoices(
            "role_or_target", "roleOrTarget", "role", "targetRole",
            "target", "position", "jobTitle", "title"
        ),
    )
    guidance: Optional[str] = Field(
        default=None,
        description="Extra info or pasted JD",
        validation_alias=AliasChoices(
            "guidance", "jobDescription", "jd", "notes", "summary"
        ),
    )
    company: Optional[str] = Field(
        default=None,
        description="Company for cover letter",
        validation_alias=AliasChoices(
            "company", "companyName", "employer", "organization", "org"
        ),
    )
    include_contact: bool = Field(
        default=True,
        description="Force-include profile contact block at top",
        validation_alias=AliasChoices(
            "include_contact", "includeContact", "withContact", "attachContact"
        ),
    )

class GenerateResponse(BaseModel):
    ok: bool
    doc_type: DocType
    resume_text: Optional[str] = None
    cover_text: Optional[str] = None
    model_used: Optional[str] = None
    timestamp: str

# =========================
#   PROFILE → CONTACT BLOCK
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

# --- De-duplication helpers (prevent repeated header blocks) ---
def _normalize_inline(s: str) -> str:
    return re.sub(r"\W+", "", s or "").lower()

def _dedupe_contact_block(contact_block: str, content: str) -> str:
    """
    After ensuring the contact_block is at the top, remove any immediate
    second header block that repeats name/phone/email in the next lines.
    Works even if the model changes casing or reorders name/phone/email.
    """
    content = content.strip()
    if not contact_block or not content.startswith(contact_block):
        return content

    contact_lines = [ln.strip() for ln in contact_block.splitlines() if ln.strip()]
    name = contact_lines[0] if contact_lines else ""
    phone = next((ln for ln in contact_lines if re.search(r"\d", ln)), "")
    email = next((ln for ln in contact_lines if "@" in ln), "")

    body = content[len(contact_block):].lstrip("\n")
    if not body:
        return content

    # look at the first chunk after the top block
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

@router.post("/resume-cover", response_model=GenerateResponse)
def generate_resume_cover(
    payload: GenerateRequest = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Generates resume and/or cover text. Automatically injects the user's Profile
    contact details at the top of each document (no placeholders).
    """
    profile = _fetch_profile(db, user.id)
    contact_block = _format_contact_block(profile, user) if payload.include_contact else ""

    role = payload.role_or_target.strip()
    guidance = (payload.guidance or "").strip()
    company = (payload.company or "").strip()
    today_str = _dt.date.today().strftime("%B %d, %Y")  # for cover date line

    resume_text: Optional[str] = None
    cover_text: Optional[str] = None
    model_used = os.getenv("DEFAULT_MODEL", "local-fallback" if not _openai_available else "gpt-4o-mini")

    target = payload.doc_type if payload.doc_type != "auto" else "both"

    if target in ("resume", "both"):
        u_prompt = RESUME_USER_TMPL.format(
            CONTACT_BLOCK=contact_block,
            role_or_target=role,
            guidance=guidance or "(none)"
        )
        raw = _call_openai(RESUME_SYSTEM, u_prompt)
        resume_text = _force_contact_on_top(contact_block, raw) if contact_block else raw
        resume_text = _dedupe_contact_block(contact_block, resume_text)

    if target in ("cover", "both"):
        u_prompt = COVER_USER_TMPL.format(
            CONTACT_BLOCK=contact_block,
            TODAY=today_str,
            role_or_target=role,
            company=company or "(not specified)",
            guidance=guidance or "(none)"
        )
        raw = _call_openai(COVER_SYSTEM, u_prompt)
        cover_text = _force_contact_on_top(contact_block, raw) if contact_block else raw
        cover_text = _dedupe_contact_block(contact_block, cover_text)

    if resume_text:
        resume_text = squeeze_blank_lines(resume_text)
        # Footer only for resumes (cover stays clean)
        resume_text = f"{resume_text}\n\n_Last updated: { _dt.date.today().strftime('%B %d, %Y') }_"

    if cover_text:
        cover_text = squeeze_blank_lines(cover_text)
        # No footer for cover letters

    return GenerateResponse(
        ok=True,
        doc_type=target,
        resume_text=resume_text,
        cover_text=cover_text,
        model_used=model_used,
        timestamp=_dt.datetime.utcnow().isoformat() + "Z",
    )
