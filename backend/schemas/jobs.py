from typing import Optional, List, Literal
from pydantic import BaseModel, Field

EmploymentType = Literal["full-time", "part-time", "contract", "internship", "temporary", "other"]

class JobItem(BaseModel):
    source: Optional[str] = None
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    posted_at: Optional[str] = None      # keep as-is (raw); we’ll parse it
    salary: Optional[str] = None         # raw string (e.g., "$60k–$75k")
    employment_type: Optional[str] = None

class JobSearchResponse(BaseModel):
    page: int
    per_page: int
    total: int
    items: List[JobItem]

class JobFilters(BaseModel):
    q: Optional[str] = None
    location: Optional[str] = None
    remote: Optional[bool] = False
    # server-side filters
    employment_type: Optional[EmploymentType] = None  # normalized values above
    min_salary: Optional[int] = None                  # numeric annual
    posted_within: Optional[Literal["24h", "7d", "30d"]] = None
    source: Optional[str] = None                      # exact match (case-insensitive)
    sort_by: Optional[Literal["relevance", "posted_at", "salary"]] = "posted_at"
    sort_order: Optional[Literal["asc", "desc"]] = "desc"
    page: int = 1
    per_page: int = 20
