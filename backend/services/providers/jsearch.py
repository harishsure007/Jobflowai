# backend/services/providers/jsearch.py
import os
import logging
from typing import List, Optional
import httpx

from backend.schemas.jobs import JobItem

log = logging.getLogger("jobs.jsearch")

HOST = os.getenv("JSEARCH_RAPIDAPI_HOST", "jsearch.p.rapidapi.com")
PATH = os.getenv("JSEARCH_RAPIDAPI_PATH", "/search")
KEY  = os.getenv("RAPIDAPI_KEY", "")

BASE_URL = f"https://{HOST}{PATH}"

# Map our UI/backend values to JSearch filters (best-effort).
def _map_date_posted(posted_within: Optional[str]) -> Optional[str]:
    # JSearch commonly supports values like: "all", "today", "3days", "week", "month"
    if not posted_within:
        return None
    s = posted_within.lower()
    if s in {"24h", "1", "1d", "day"}:
        return "today"
    if s in {"7d", "7", "week"}:
        return "week"
    if s in {"30d", "30", "month"}:
        return "month"
    return None  # omit filter

def _map_employment_type(et: Optional[str]) -> Optional[str]:
    # JSearch expects one of: FULLTIME, PARTTIME, CONTRACTOR, INTERN (strings)
    if not et:
        return None
    s = et.lower()
    if s == "full-time":
        return "FULLTIME"
    if s == "part-time":
        return "PARTTIME"
    if s == "contract":
        return "CONTRACTOR"
    if s == "internship":
        return "INTERN"
    # temporary/other -> omit (let results flow)
    return None

def _build_query(query: str, location: str, remote: bool) -> str:
    q = (query or "").strip()
    if location:
        q = f"{q} {location}".strip()
    if remote and "remote" not in q.lower():
        q = f"{q} remote".strip()
    return q or "software engineer"

async def fetch_jsearch_jobs(
    *,
    client: httpx.AsyncClient,
    query: str,
    location: str,
    remote: bool,
    page: int,
    per_page: int,
    posted_within: Optional[str],
    employment_type: Optional[str],
) -> List[JobItem]:
    if not KEY:
        log.warning("JSearch: RAPIDAPI_KEY missing; returning []")
        return []

    q = _build_query(query, location, remote)
    dp = _map_date_posted(posted_within)
    et = _map_employment_type(employment_type)

    # Fetch slightly more than needed to survive local filters/pagination
    num_pages = 1  # JSearch paginates internally; keep simple & slice locally
    params = {
        "query": q,
        "page": str(max(page, 1)),
        "num_pages": str(num_pages),
    }
    if dp:
        params["date_posted"] = dp
    if et:
        # JSearch supports employment_types (array), but querystring is typically comma-separated or repeated key.
        # We'll pass a single value; broad is better if vendor differs.
        params["employment_types"] = et

    headers = {"x-rapidapi-key": KEY, "x-rapidapi-host": HOST}

    try:
        r = await client.get(BASE_URL, params=params, headers=headers)
    except Exception as e:
        log.warning("JSearch request failed: %s", e)
        return []

    if r.status_code != 200:
        log.warning("JSearch non-200: %s %s", r.status_code, r.text[:300])
        return []

    data = r.json()
    items = data.get("data") or []
    log.info("JSearch returned %d raw items", len(items))

    out: List[JobItem] = []
    for it in items:
        # Safely extract with fallbacks
        title       = it.get("job_title") or it.get("title")
        company     = it.get("employer_name") or it.get("company_name") or it.get("job_publisher")
        location_s  = ", ".join(
            [x for x in [it.get("job_city"), it.get("job_state"), it.get("job_country")] if x]
        ) or it.get("job_city") or it.get("job_state") or it.get("job_country") or it.get("job_is_remote") and "Remote" or ""
        desc        = it.get("job_description") or it.get("description") or ""
        url         = it.get("job_apply_link") or it.get("job_apply_link_raw") or it.get("job_apply_is_direct") and it.get("job_apply_link") or it.get("job_apply_url")
        posted_at   = it.get("job_posted_at_datetime_utc") or it.get("job_posted_at") or it.get("posted_at")
        emp_type    = it.get("job_employment_type") or (it.get("job_employment_types") or [None])[0]
        source      = it.get("job_publisher") or "JSearch"
        salary_text = None

        # Try to build a useful salary string if present
        min_sal = it.get("job_min_salary")
        max_sal = it.get("job_max_salary")
        curr    = it.get("job_salary_currency")
        period  = it.get("job_salary_period")  # e.g., YEAR
        if min_sal or max_sal:
            # format: 80,000–100,000 USD / YEAR
            def fmt(n):
                try:
                    return f"{int(n):,}"
                except Exception:
                    return str(n)
            range_s = None
            if min_sal and max_sal:
                range_s = f"{fmt(min_sal)}–{fmt(max_sal)}"
            elif max_sal:
                range_s = fmt(max_sal)
            elif min_sal:
                range_s = fmt(min_sal)
            if range_s:
                suffix = ""
                if curr:  suffix += f" {curr}"
                if period: suffix += f" / {period}"
                salary_text = f"{range_s}{suffix}"

        out.append(JobItem(
            title=title or "Untitled",
            company=company or "",
            location=location_s or "",
            description=desc or "",
            url=url or "",
            posted_at=posted_at or "",
            employment_type=str(emp_type or ""),
            salary=salary_text or "",
            source=source or "JSearch",
        ))

    # Slice defensively (server returns ~10 per page by default). We’re already passing page.
    # If you want real cross-provider pagination, keep aggregator doing it.
    return out[: max(per_page, 1)]
