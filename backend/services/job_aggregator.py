import os
import logging
import asyncio
from typing import List, Tuple, Optional

import httpx
from backend.schemas.jobs import JobItem
from backend.services.normalize import (
    norm_employment_type, parse_salary_max, parse_ts, within_days
)
from backend.services.providers.jsearch import fetch_jsearch_jobs
from backend.services.providers.linkedin import fetch_linkedin_jobs
from backend.services.providers.indeed import fetch_indeed_jobs

log = logging.getLogger("jobs.aggregator")


def _enabled(env_name: str) -> bool:
    """Check if a provider is enabled via environment variable."""
    return os.getenv(env_name, "false").strip().lower() == "true"


def _norm_posted_within(v: Optional[str]) -> Optional[str]:
    """Normalize UI posted_within values to '24h', '7d', '30d' or None."""
    if not v:
        return None
    s = str(v).strip().lower()
    if s in {"any", "all", "none"}:
        return None
    if s in {"1", "24h", "24"}:
        return "24h"
    if s in {"7", "7d", "week"}:
        return "7d"
    if s in {"30", "30d", "month"}:
        return "30d"
    return None


async def aggregate_jobs(
    *,
    query: str,
    location: Optional[str] = None,
    remote: bool = False,
    employment_type: Optional[str] = None,
    min_salary: Optional[int] = None,
    posted_within: Optional[str] = None,
    source: Optional[str] = None,
    sort_by: str = "posted_at",
    sort_order: str = "desc",
    page: int = 1,
    per_page: int = 20,
) -> Tuple[List[JobItem], int]:
    """Aggregate jobs from multiple providers with safe filters."""

    use_jsearch = _enabled("PROVIDER_JSEARCH_ENABLED")
    use_linkedin = _enabled("PROVIDER_LINKEDIN_ENABLED")
    use_indeed = _enabled("PROVIDER_INDEED_ENABLED")

    posted_within = _norm_posted_within(posted_within)

    log.info(
        "AGG: flags jsearch=%s linkedin=%s indeed=%s | q='%s' loc='%s' remote=%s posted_within=%s et=%s min_salary=%s source=%s page=%s per_page=%s",
        use_jsearch, use_linkedin, use_indeed, query, location, remote,
        posted_within, employment_type, min_salary, source, page, per_page
    )

    results: List[JobItem] = []

    async with httpx.AsyncClient(timeout=30) as client:
        tasks = []

        if use_jsearch:
            tasks.append(fetch_jsearch_jobs(
                client=client,
                query=query,
                location=location,
                remote=remote,
                page=page,
                per_page=per_page,
                posted_within=posted_within,
                employment_type=employment_type,
            ))

        if use_linkedin:
            tasks.append(fetch_linkedin_jobs(
                client=client,
                query=query,
                location=location,
                remote=remote,
                page=page,
                per_page=per_page,
            ))

        if use_indeed:
            tasks.append(fetch_indeed_jobs(
                client=client,
                query=query,
                location=location,
                remote=remote,
                page=page,
                per_page=per_page,
            ))

        results_list = await asyncio.gather(*tasks, return_exceptions=True)
        for items in results_list:
            if isinstance(items, Exception):
                log.warning("Provider fetch failed: %s", items)
            elif items:
                log.info("AGG: provider returned %d items", len(items))
                results.extend(items)

    log.info("AGG: raw items from providers = %d", len(results))
    for j in results:
        log.info("RAW JOB: title=%s, company=%s, location=%s, salary=%s, posted_at=%s, employment_type=%s, source=%s",
                 j.title, j.company, j.location, j.salary, j.posted_at, j.employment_type, j.source)

    # --- normalize + safe filters ---
    filtered: List[JobItem] = []
    for j in results:
        try:
            et_norm = norm_employment_type(j.employment_type)
            ts_ms = parse_ts(j.posted_at)
            sal_max = parse_salary_max(j.salary)

            skip_reason = None

            # Employment type filter (skip only if normalized value exists and mismatches)
            if employment_type and et_norm and et_norm.lower() != employment_type.lower():
                skip_reason = f"employment_type mismatch ({et_norm} != {employment_type})"

            # Salary filter (skip only if salary exists and below min)
            if not skip_reason and min_salary and sal_max is not None and sal_max < min_salary:
                skip_reason = f"salary {sal_max} < min_salary {min_salary}"

            # Posted within filter (skip only if date exists and outside range)
            if not skip_reason and posted_within:
                days_map = {"24h": 1, "7d": 7, "30d": 30}
                days_limit = days_map.get(posted_within)
                if days_limit and ts_ms is not None and not within_days(ts_ms, days_limit):
                    skip_reason = f"posted_at older than {posted_within}"

            # Source filter
            if not skip_reason and source and j.source and j.source.lower() != source.lower():
                skip_reason = f"source mismatch ({j.source} != {source})"

            if skip_reason:
                log.info("Skipping job '%s' due to: %s", j.title, skip_reason)
                continue

            j.employment_type = et_norm or j.employment_type
            filtered.append(j)
        except Exception as e:
            log.exception("Error processing job '%s': %s", j.title, e)

    log.info("AGG: after filters total=%d (page=%d, per_page=%d)", len(filtered), page, per_page)

    # --- sort ---
    reverse = sort_order.lower() == "desc"
    if sort_by == "posted_at":
        filtered.sort(key=lambda x: (parse_ts(x.posted_at) or 0), reverse=reverse)
    elif sort_by == "salary":
        filtered.sort(key=lambda x: (parse_salary_max(x.salary) or 0), reverse=reverse)

    # --- paginate ---
    total = len(filtered)
    start = (page - 1) * per_page
    end = start + per_page
    paginated = filtered[start:end]

    log.info("AGG: returning %d jobs (page=%d, per_page=%d, total=%d)", len(paginated), page, per_page, total)

    return paginated, total
