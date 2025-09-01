# backend/routes/generate.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from backend.services.openai_client import OpenAIClient
import logging

router = APIRouter()
client = OpenAIClient()

# ======== Schemas ========

class GenerateRequest(BaseModel):
    prompt: str = Field(..., max_length=5000)
    system_prompt: Optional[str] = None
    temperature: float = 0.7


class InterviewRequest(BaseModel):
    resume_text: str = Field(..., max_length=10000)
    jd_text: str = Field(..., max_length=10000)
    role: str = Field(..., max_length=100)
    question: str = Field(..., max_length=500)
    question_type: str = Field(..., max_length=50)


class AssistantRequest(BaseModel):
    message: str = Field(..., max_length=5000)


class InterviewQuestionsRequest(BaseModel):
    role: str = Field(..., max_length=120)
    experience: str = Field(..., max_length=120)  # e.g., "2 years" / "junior"
    focus: Optional[str] = Field(None, max_length=60)  # "technical" | "behavioral" | "system design"
    count: int = Field(5, ge=3, le=12)


class InterviewQuestionsResponse(BaseModel):
    questions: List[str]


# ======== Endpoints ========

@router.post("/generate", tags=["OpenAI"])
async def generate_text(request: GenerateRequest):
    """
    Generic text generation endpoint.
    """
    try:
        response = client.get_completion(
            prompt=request.prompt,
            system_prompt=request.system_prompt,
            temperature=request.temperature
        )
        return {"response": response}
    except Exception as e:
        logging.exception("❌ OpenAI generation error")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/generate-answer", tags=["OpenAI"])
async def generate_answer(request: InterviewRequest):
    """
    Draft a tailored interview answer using resume + JD context.
    """
    prompt = (
        f"You are an expert interview coach helping candidates prepare for a {request.role} role.\n\n"
        f"Resume:\n{request.resume_text}\n\n"
        f"Job Description:\n{request.jd_text}\n\n"
        f"Question Type: {request.question_type}\n"
        f"Interview Question: {request.question}\n\n"
        f"Generate a strong, professional answer tailored to the resume and job description."
    )
    try:
        answer = client.get_completion(
            prompt=prompt,
            system_prompt="You are a helpful interview coach.",
            temperature=0.7
        )
        return {"answer": answer}
    except Exception as e:
        logging.exception("❌ OpenAI answer generation error")
        raise HTTPException(status_code=500, detail=f"Answer generation failed: {str(e)}")


@router.post("/interview-assistant", tags=["OpenAI"])
async def interview_assistant(request: AssistantRequest):
    """
    Free-form interview assistant chat.
    """
    try:
        response = client.get_completion(
            prompt=request.message,
            system_prompt="You are an AI-powered interview coach.",
            temperature=0.7
        )
        return {"reply": response}
    except Exception as e:
        logging.exception("❌ Interview assistant error")
        raise HTTPException(status_code=500, detail=f"Assistant response failed: {str(e)}")


@router.post("/generate-questions", tags=["OpenAI"], response_model=InterviewQuestionsResponse)
async def generate_questions(req: InterviewQuestionsRequest):
    """
    Generate a clean list of interview questions for a given role/experience/focus.
    """
    focus_txt = f"{req.focus} " if req.focus else ""
    prompt = (
        f"You are an expert interview coach. Generate {req.count} {focus_txt}"
        f"interview questions for a {req.role} candidate with {req.experience} experience.\n"
        f"Return a clean numbered list, one question per line, no extra commentary."
    )

    try:
        raw = client.get_completion(
            prompt=prompt,
            system_prompt="You are concise and produce clean lists.",
            temperature=0.6
        )

        # Normalize to a list of questions
        lines = [l.strip() for l in str(raw).splitlines() if l.strip()]
        cleaned: List[str] = []
        for l in lines:
            # remove leading numbering like "1) ", "1. ", "1 - "
            cleaned.append(l.lstrip("0123456789.)- \t").strip())

        # keep only requested count and drop empties
        cleaned = [q for q in cleaned if q][: req.count]

        if not cleaned:
            raise ValueError("Empty questions from model")

        return InterviewQuestionsResponse(questions=cleaned)

    except Exception as e:
        logging.exception("❌ Interview question generation error")
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")
