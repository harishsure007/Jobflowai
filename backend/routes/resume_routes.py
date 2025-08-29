from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from backend.database import get_db
from backend.models import Resume
from backend.middleware.auth_middleware import require_user_id

router = APIRouter(prefix="/resume", tags=["Resume"])

def _uid_int(uid: str) -> int:
    try:
        return int(uid)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token subject")

# Pydantic v2 schemas
class ResumeIn(BaseModel):
    title: str
    content: str
    source: str | None = "enhanced"

class ResumeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    title: str
    content: str
    source: str

@router.get("/", response_model=list[ResumeOut])
def list_resumes(db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    return (db.query(Resume)
              .filter(Resume.user_id == uid_i)
              .order_by(Resume.created_at.desc())
              .all())

@router.get("/{resume_id}", response_model=ResumeOut)
def get_resume(resume_id: int, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    r = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == uid_i).first()
    if not r:
        raise HTTPException(404, "Not found")
    return r

@router.post("/", response_model=ResumeOut)
def create_resume(body: ResumeIn, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    r = Resume(user_id=uid_i, title=body.title, content=body.content, source=body.source or "enhanced")
    db.add(r); db.commit(); db.refresh(r)
    return r

@router.patch("/{resume_id}", response_model=ResumeOut)
def update_resume(resume_id: int, body: ResumeIn, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    r = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == uid_i).first()
    if not r:
        raise HTTPException(404, "Not found")
    r.title = body.title or r.title
    r.content = body.content or r.content
    r.source = body.source or r.source
    db.commit(); db.refresh(r)
    return r

@router.delete("/{resume_id}")
def delete_resume(resume_id: int, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    r = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == uid_i).first()
    if not r:
        raise HTTPException(404, "Not found")
    db.delete(r); db.commit()
    return {"ok": True}
