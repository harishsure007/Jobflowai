import os
import httpx
import logging
from typing import List, Optional
from datetime import datetime, timedelta
from backend.schemas.jobs import JobItem

log = logging.getLogger("jobs.providers.linkedin")

HOST = os.getenv("LINKEDIN_RAPIDAPI_HOST", "linkedin-jobs-search.p.rapidapi.com")
BASE_URL = f"https://{HOST}"

def _filter_posted_within(posted_at_str: str, posted_within: Optional[str]) -> bool:
    """Return True if job was posted within the given range."""
    if not posted_within or not posted_at_str:
        return True
    try:
        posted_dt = datetime.fromisoformat(posted_at_str)
    except Exception:
        return True  # Unknown format, keep job
    now = datetime.utcnow()
    days_map = {"24h": 1, "7d": 7, "30d": 30}
    limit_days = days_map.get(posted_within, 0)
    return (now - posted_dt) <= timedelta(days=limit_days)


async def fetch_linkedin_jobs(
    client: httpx.AsyncClient,
    *,
    query: str,
    location: Optional[str],
    remote: Optional[bool] = False,
    page: int = 1,
    per_page: int = 20,
    employment_type: Optional[str] = None,
    posted_within: Optional[str] = None,
) -> List[JobItem]:
    """Fetch jobs from LinkedIn via RapidAPI."""
    RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
    if not RAPIDAPI_KEY:
        log.warning("No RAPIDAPI_KEY for LinkedIn")
        return []

    headers = {"x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": HOST}

    # Determine location
    loc = location or ("remote" if remote else "")

    try:
        r = await client.post(
            f"{BASE_URL}/search",
            headers=headers,
            json={
                "keywords": query or "software engineer",
                "location": loc,
                "page": max(1, page),
                "num_pages": 1,
            },
            timeout=30,
        )
        if r.status_code != 200:
            log.error("LinkedIn POST /search -> %s %s", r.status_code, r.text[:300])
            return []

        data = r.json()
        rows = data if isinstance(data, list) else data.get("data", [])
        items: List[JobItem] = []

        for row in rows:
            etype = row.get("employmentType", "").lower()
            posted_at = str(row.get("postedAt") or row.get("listedAt") or "")

            # Filter by employment_type
            if employment_type and etype and etype != employment_type.lower():
                continue

            # Filter by posted_within
            if not _filter_posted_within(posted_at, posted_within):
                continue

            items.append(JobItem(
                source="LinkedIn",
                title=row.get("title") or row.get("jobTitle") or "",
                company=row.get("company") or row.get("companyName") or "",
                location=row.get("location") or row.get("jobLocation") or "",
                description=row.get("description") or "",
                url=row.get("url") or row.get("jobUrl") or "",
                employment_type=etype or None,
                posted_at=posted_at,
            ))

        log.info("LinkedIn returned %d items", len(items))
        return items[:per_page]

    except Exception as e:
        log.exception("LinkedIn fetch failed: %s", e)
        return []
