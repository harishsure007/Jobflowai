from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from backend.services.openai_client import OpenAIClient
import logging

router = APIRouter()
client = OpenAIClient()

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

@router.post("/generate", tags=["OpenAI"])
async def generate_text(request: GenerateRequest):
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
