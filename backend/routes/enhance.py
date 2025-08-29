from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any, Literal
from backend.services.openai_client import OpenAIClient
from backend.config import FEATURE_RESUME_ENHANCEMENT
import logging

router = APIRouter(prefix="/enhance", tags=["Enhance"])
client = OpenAIClient()


class EnhanceRequest(BaseModel):
    resume_text: str = Field(..., max_length=20000)
    jd_text: Optional[str] = Field(default=None, max_length=20000)
    missing_keywords: List[str] = Field(default_factory=list)
    strategy: Literal["keywords_only", "rewrite_experience"] = "rewrite_experience"
    options: Optional[Dict[str, Any]] = None

    @field_validator("resume_text")
    @classmethod
    def _strip_resume(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Resume text is required")
        return v

    @field_validator("jd_text")
    @classmethod
    def _strip_jd(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None

    @field_validator("missing_keywords")
    @classmethod
    def _cap_keywords(cls, v: List[str]) -> List[str]:
        seen = set()
        cleaned = []
        for kw in v or []:
            s = (kw or "").strip()
            if not s:
                continue
            if s.lower() in seen:
                continue
            seen.add(s.lower())
            cleaned.append(s)
            if len(cleaned) >= 200:
                break
        return cleaned


@router.post("")
async def enhance_resume(request: EnhanceRequest):
    if not FEATURE_RESUME_ENHANCEMENT:
        raise HTTPException(status_code=403, detail="Resume enhancement is disabled")

    kws = request.missing_keywords or []
    keywords_line = ", ".join(kws) if kws else "None provided"

    rewrite_strength = 0.7
    if isinstance(request.options, dict):
        try:
            rs = float(request.options.get("rewrite_strength", rewrite_strength))
            rewrite_strength = max(0.0, min(1.0, rs))
        except Exception:
            pass

    # Optional: Warn the model if JD and resume seem mismatched
    role_hint = ""
    jd_lower = (request.jd_text or "").lower()
    resume_lower = request.resume_text.lower()
    if "java" in jd_lower and "data analyst" in resume_lower:
        role_hint = (
            "\nNote: The job description is for a Java Developer, "
            "but the resume appears to be for a Data Analyst. "
            "Do not fabricate experience—rewrite responsibly based on provided content."
        )
    elif "data analyst" in jd_lower and "java" in resume_lower:
        role_hint = (
            "\nNote: The job description is for a Data Analyst, "
            "but the resume appears to mention Java heavily. "
            "Rewrite responsibly and maintain consistency with actual experience."
        )

    # Prompt generation
    if request.strategy == "keywords_only":
        prompt = (
            "You are a resume writing assistant.\n\n"
            "Task:\n"
            "- Improve clarity, action verbs, and ATS alignment.\n"
            "- Keep the original structure and experience as-is.\n"
            "- Weave in the provided keywords naturally (avoid keyword stuffing).\n"
            "- Output only the enhanced resume (no commentary).\n\n"
            f"Keywords to incorporate: {keywords_line}\n\n"
            f"Original resume:\n{request.resume_text}\n\n"
            "Enhanced resume:"
        )
    else:
        prompt = (
            "You are a senior resume writer.\n\n"
            "Goal:\n"
            "- Rewrite the Summary and Experience sections to align strongly with the Job Description.\n"
            "- Weave missing keywords naturally (no stuffing) and quantify outcomes when possible.\n"
            "- Keep a professional tone, preserve section headings, and keep Education/Certifications intact.\n"
            "- Avoid fabricating employers or projects; phrase responsibly based on the existing content.\n"
            "- Respect concision: rewrite_strength controls how bold the rewrites are (0=minimal, 1=bold).\n"
            "- Output only the final resume text."
            f"{role_hint}\n\n"
            f"rewrite_strength: {rewrite_strength}\n"
            f"Missing keywords: {keywords_line}\n\n"
            f"Job Description (for alignment):\n{request.jd_text or ''}\n\n"
            f"Original resume:\n{request.resume_text}\n\n"
            "Rewritten resume:"
        )

    try:
        enhanced_text = client.get_completion(
            prompt=prompt,
            system_prompt="You are a helpful, concise resume writing assistant.",
            temperature=0.6 if request.strategy == "keywords_only" else 0.7,
        )

        return {
            "rewritten_resume": enhanced_text,
            "enhanced_resume": enhanced_text,
            "improved_resume": enhanced_text,
            "used_keywords": kws,
            "strategy": request.strategy,
        }
    except Exception as e:
        logging.exception("❌ OpenAI enhancement error")
        raise HTTPException(status_code=500, detail=f"Enhancement failed: {str(e)}")
