# backend/routes/feedback.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Feedback

router = APIRouter()

# -------------------- CREATE FEEDBACK --------------------
@router.post("/feedback/", status_code=201)
def create_feedback(question: str, answer: str, feedback: str, db: Session = Depends(get_db)):
    new_feedback = Feedback(question=question, answer=answer, feedback=feedback)
    db.add(new_feedback)
    db.commit()
    db.refresh(new_feedback)
    return {
        "message": "Feedback submitted successfully",
        "id": new_feedback.id
    }

# -------------------- GET FEEDBACK BY ID --------------------
@router.get("/feedback/{feedback_id}")
def get_feedback(feedback_id: int, db: Session = Depends(get_db)):
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return feedback

# -------------------- GET ALL FEEDBACK --------------------
@router.get("/feedback/")
def get_all_feedback(db: Session = Depends(get_db)):
    feedback_list = db.query(Feedback).all()
    return feedback_list

# -------------------- UPDATE FEEDBACK --------------------
@router.put("/feedback/{feedback_id}")
def update_feedback(feedback_id: int, question: str, answer: str, feedback: str, db: Session = Depends(get_db)):
    feedback_entry = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback_entry:
        raise HTTPException(status_code=404, detail="Feedback not found")

    feedback_entry.question = question
    feedback_entry.answer = answer
    feedback_entry.feedback = feedback
    db.commit()
    db.refresh(feedback_entry)

    return {
        "message": "Feedback updated successfully",
        "updated_data": feedback_entry
    }

# -------------------- DELETE FEEDBACK --------------------
@router.delete("/feedback/{feedback_id}")
def delete_feedback(feedback_id: int, db: Session = Depends(get_db)):
    feedback_entry = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback_entry:
        raise HTTPException(status_code=404, detail="Feedback not found")

    db.delete(feedback_entry)
    db.commit()
    return {"message": "Feedback deleted successfully"}
