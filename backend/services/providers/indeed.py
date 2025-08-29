import os, httpx, logging
from typing import List, Optional
from backend.schemas.jobs import JobItem

log = logging.getLogger("jobs.providers.indeed")

HOST = os.getenv("INDEED_RAPIDAPI_HOST", "indeed12.p.rapidapi.com")
PATH = os.getenv("INDEED_RAPIDAPI_PATH", "/jobs/search")
BASE_URL = f"https://{HOST}"

async def fetch_indeed_jobs(client: httpx.AsyncClient, *, query: str, location: str,
                            remote: Optional[bool], page: int, per_page: int) -> List[JobItem]:
    RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")  # ✅ read at call time
    if not RAPIDAPI_KEY:
        log.warning("No RAPIDAPI_KEY for Indeed")
        return []

    q = (query or "software engineer").strip()
    if remote and "remote" not in q.lower():
        q += " remote"

    params = {"query": q, "location": location or "", "page": str(max(1, page))}
    headers = {"x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": HOST}

    try:
        r = await client.get(BASE_URL + PATH, headers=headers, params=params, timeout=30)
        if r.status_code != 200:
            log.error("Indeed %s%s -> %s %s", HOST, PATH, r.status_code, r.text[:300])
            return []
        data = r.json()
        results = data.get("results") or data.get("data") or (data if isinstance(data, list) else [])
        items: List[JobItem] = []
        for row in results if isinstance(results, list) else []:
            items.append(JobItem(
                source="Indeed",
                title=row.get("title") or "",
                company=row.get("company") or "",
                location=row.get("location") or "",
                description=row.get("description") or row.get("snippet"),
                url=row.get("url") or row.get("jobUrl"),
                posted_at=str(row.get("date") or row.get("postedAt") or ""),
                salary=row.get("salary"),
            ))
        log.info("Indeed returned %d items", len(items))
        return items[:per_page]
    except Exception as e:
        log.exception("Indeed request failed: %s", e)
        return []
