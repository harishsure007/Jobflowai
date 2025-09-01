// src/DashboardPages/JobPostingsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const SEARCH_URL = `${API_BASE_URL}/api/v1/jobs/search`;

export default function JobPostingsPage() {
  const [q, setQ] = useState("data analyst");
  const [location, setLocation] = useState("remote");
  const [remote, setRemote] = useState(true);
  const [page, setPage] = useState(1);

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // filters
  const [employmentType, setEmploymentType] = useState("any");
  const [postedWithin, setPostedWithin] = useState("any");
  const [sourceFilter, setSourceFilter] = useState("any");
  const [expLevel, setExpLevel] = useState("any");

  const sourceOptions = useMemo(() => {
    const uniq = new Set();
    jobs.forEach((j) => j?.source && uniq.add(j.source));
    return ["any", ...Array.from(uniq)];
  }, [jobs]);

  const toApiPostedWithin = (v) => {
    if (v === "1") return "24h";
    if (v === "7") return "7d";
    if (v === "30") return "30d";
    return undefined;
  };

  const fetchJobs = async (nextPage = page) => {
    setLoading(true);
    setErr("");
    try {
      const res = await axios.get(SEARCH_URL, {
        params: {
          q,
          location,
          remote,
          page: nextPage,
          per_page: 20,
          employment_type: employmentType === "any" ? undefined : employmentType,
          posted_within: toApiPostedWithin(postedWithin),
          source: sourceFilter === "any" ? undefined : sourceFilter,
          sort_by: "posted_at",
          sort_order: "desc",
        },
      });

      const data = res.data;
      if (Array.isArray(data)) {
        setJobs(data);
        setTotal(null);
      } else if (data && Array.isArray(data.items)) {
        setJobs(data.items);
        setTotal(typeof data.total === "number" ? data.total : null);
      } else {
        setJobs([]);
        setTotal(null);
      }
    } catch (e) {
      console.error(e);
      setErr("Failed to fetch jobs. Please try again.");
      setJobs([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    setPage(1);
    fetchJobs(1);
  };
  const handlePrev = () => {
    if (page > 1) {
      const p = page - 1;
      setPage(p);
      fetchJobs(p);
    }
  };
  const handleNext = () => {
    const p = page + 1;
    setPage(p);
    fetchJobs(p);
  };

  const filteredJobs = useMemo(() => {
    const wantExp = (v) => {
      if (expLevel === "any") return true;
      const hay = [v?.title, v?.description].filter(Boolean).join(" ").toLowerCase();
      if (expLevel === "junior") return /\b(junior|entry|new grad|0-2\s*years)\b/.test(hay);
      if (expLevel === "mid") return /\b(mid|intermediate|3-5\s*years)\b/.test(hay);
      if (expLevel === "senior") return /\b(senior|sr\.?|6\+?\s*years|principal)\b/.test(hay);
      if (expLevel === "lead") return /\b(lead|staff|principal|manager)\b/.test(hay);
      return true;
    };
    return jobs.filter((j) => wantExp(j));
  }, [jobs, expLevel]);

  return (
    <div className="jobs-wrap">
      <style>{css}</style>

      <header className="header">
        <h2 className="title">
          📌 Job Postings <span className="muted">(Aggregated)</span>
        </h2>

        {/* Top search */}
        <div className="filters top">
          <input
            className="input"
            placeholder="Keywords (e.g., data analyst)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <input
            className="input"
            placeholder="Location (e.g., New York or remote)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
            />
            <span>Remote</span>
          </label>
          <button className="btn primary" onClick={handleSearch} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Filters row */}
        <div className="filters bottom">
          <select
            className="select"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
          >
            <option value="any">Employment type — Any</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
            <option value="temporary">Temporary</option>
          </select>

          <select
            className="select"
            value={postedWithin}
            onChange={(e) => setPostedWithin(e.target.value)}
          >
            <option value="any">Posted — Any time</option>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>

          <select
            className="select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            {sourceOptions.map((src) => (
              <option key={src} value={src}>
                {src === "any" ? "Source — Any" : src}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={expLevel}
            onChange={(e) => setExpLevel(e.target.value)}
          >
            <option value="any">Experience — Any</option>
            <option value="junior">Junior / Entry</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
            <option value="lead">Lead / Staff</option>
          </select>

          <button
            className="btn"
            onClick={() => {
              setEmploymentType("any");
              setPostedWithin("any");
              setSourceFilter("any");
              setExpLevel("any");
            }}
          >
            Reset filters
          </button>
        </div>

        {!loading && (
          <div className="subtle">
            Showing {filteredJobs.length} result{filteredJobs.length === 1 ? "" : "s"}
            {typeof total === "number" ? ` (server total: ${total})` : ""}
          </div>
        )}
      </header>

      {err && <div className="alert">{err}</div>}

      {loading && (
        <div className="list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="card skeleton" key={i}>
              <div className="s-line w40" />
              <div className="s-line w20" />
              <div className="s-line w30" />
              <div className="s-line w90" />
              <div className="s-line w80" />
            </div>
          ))}
        </div>
      )}

      {!loading && filteredJobs.length > 0 && (
        <>
          <div className="list">
            {filteredJobs.map((job, idx) => (
              <JobCard job={job} key={idx} />
            ))}
          </div>

          <div className="pager">
            <button className="btn" onClick={handlePrev} disabled={loading || page === 1}>
              ◀ Prev
            </button>
            <span className="page-ind">
              Page {page}
              {typeof total === "number"
                ? ` • Showing ${filteredJobs.length} of ${total}`
                : ""}
            </span>
            <button className="btn" onClick={handleNext} disabled={loading}>
              Next ▶
            </button>
          </div>
        </>
      )}

      {!loading && filteredJobs.length === 0 && !err && (
        <div className="empty">
          <div className="empty-emoji">🔎</div>
          <h3>No jobs match these filters</h3>
          <p>Try clearing filters or broadening your keywords.</p>
        </div>
      )}
    </div>
  );
}

function JobCard({ job }) {
  const {
    title,
    company,
    location,
    salary,
    description,
    url,
    posted_at,
    employment_type,
    source,
  } = job || {};

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3 className="job-title">{title || "Untitled role"}</h3>
          <div className="meta">
            {company && <span className="chip">{company}</span>}
            {location && <span className="dot">•</span>}
            {location && <span className="chip soft">{location}</span>}
            {employment_type && (
              <>
                <span className="dot">•</span>
                <span className="chip soft">{employment_type}</span>
              </>
            )}
          </div>
        </div>

        <div className="right-top">
          {salary && <div className="salary">{salary}</div>}
          {posted_at && <div className="posted">Posted: {formatDate(posted_at)}</div>}
        </div>
      </div>

      {description && (
        <p className="desc">
          {description.slice(0, 320)}
          {description.length > 320 ? "…" : ""}
        </p>
      )}

      <div className="card-foot">
        <div className="source">
          Source: <span className="badge">{source || "Unknown"}</span>
        </div>
        {url && (
          <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">
            View / Apply →
          </a>
        )}
      </div>
    </article>
  );
}

function formatDate(v) {
  try {
    if (v === null || v === undefined || v === "") return "";
    const num = Number(v);
    if (Number.isFinite(num)) {
      if (num >= 1e12) return new Date(num).toLocaleDateString();
      if (num >= 1e9) return new Date(num * 1000).toLocaleDateString();
    }
    const d = new Date(v);
    if (!isNaN(d)) return d.toLocaleDateString();
  } catch (_) {}
  return String(v);
}

const css = `
.jobs-wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
.header { position: sticky; top: 0; z-index: 5; backdrop-filter: blur(6px);
  background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.85));
  padding-bottom: 14px; margin-bottom: 10px; border-bottom: 1px solid #eef0f3;
}
.title { margin: 0 0 12px; font-size: 24px; font-weight: 800; }
.muted { font-weight: 600; color: #697386; font-size: 16px; }

/* rows */
.filters { display: grid; gap: 10px; align-items: center; }
.filters.top { grid-template-columns: 1.5fr 1.2fr auto auto; }
.filters.bottom { grid-template-columns: 1fr 1fr 1fr 1fr auto; margin-top: 10px; }

/* Inputs/Selects with background color like source chips */
.input, .select {
  width: 100%;
  height: 42px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 20px;
  border: 1px solid #dfe3e6;
  border-radius: 10px;
  background: #eef2ff;   /* 👈 light chip-style background */
  outline: none;
}
.input::placeholder { color: #6b7280; }
.select { appearance: none; }

/* === BUTTONS (Sky Blue palette, old outline style) === */
/* === BUTTONS (Blue-400 / Blue-500) === */
.btn {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #60a5fa;   /* Blue-400 */
  background: #2563eb;         /* default */
  color: #fff;
  cursor: pointer;
  font-weight: 600;
  transition: background .2s, transform .02s, border-color .2s;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn:hover { background: #3b82f6; border-color: #3b82f6; } /* Blue-500 */
.btn:active { transform: translateY(1px); }

.btn.primary {
  background: #2563eb;   /* Blue-500 for primary */
  border-color: #3b82f6;
  color: #fff;
}
.btn.primary:hover { background: #2563eb; border-color: #2563eb; } /* Blue-600 on hover */


.subtle { margin-top: 8px; color: #6b7280; font-size: 13px; }

.alert { margin-top: 14px; padding: 10px 12px; background: #fff4f4; border: 1px solid #ffd9d9; color: #b42318; border-radius: 10px; }

.list { display: grid; gap: 14px; margin-top: 14px; }
.card {
  background: #fff; border: 1px solid #e6e9ee; border-radius: 16px; padding: 18px 18px 14px;
  box-shadow: 0 2px 8px rgba(16,24,40,0.04);
}
.card:hover { box-shadow: 0 6px 20px rgba(16,24,40,0.08); }
.card-head { display: flex; justify-content: space-between; gap: 16px; }
.job-title { margin: 0 0 6px; font-size: 18px; font-weight: 800; color: #111827; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: #4b5563; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: #eef2ff; color: #1f2937; font-weight: 600; font-size: 12px; }
.chip.soft { background: #f3f4f6; color: #374151; }
.dot { color: #9ca3af; }

.right-top { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; white-space: nowrap; }
.salary { font-weight: 700; color: #0f766e; }
.posted { font-size: 12px; color: #6b7280; }

.desc { margin: 12px 0 8px; color: #374151; line-height: 1.5; }

.card-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.source { font-size: 12px; color: #6b7280; }
.badge { padding: 2px 8px; border-radius: 999px; background: #eef2ff; color: #1f2937; font-weight: 700; }

.pager { display: flex; justify-content: center; align-items: center; gap: 10px; margin: 18px 0 8px; }
.page-ind { color: #4b5563; font-weight: 600; }

.empty { text-align: center; padding: 50px 10px; color: #6b7280; }
.empty-emoji { font-size: 40px; margin-bottom: 8px; }

/* Skeletons */
.skeleton .s-line { height: 12px; border-radius: 6px; background: linear-gradient(90deg, #f2f4f7, #eaeef3, #f2f4f7);
  background-size: 200% 100%; animation: shimmer 1.2s infinite; margin-bottom: 10px; }
.skeleton .w20 { width: 20%; } .skeleton .w30 { width: 30%; } .skeleton .w40 { width: 40%; }
.skeleton .w80 { width: 80%; } .skeleton .w90 { width: 90%; }
@keyframes shimmer { 0% { background-position: 0% 0; } 100% { background-position: -200% 0; } }

/* Responsive */
@media (max-width: 1100px) {
  .filters.bottom { grid-template-columns: 1fr 1fr 1fr auto; }
}
@media (max-width: 900px) {
  .filters.top { grid-template-columns: 1fr; }
  .filters.bottom { grid-template-columns: 1fr 1fr; }
  .card-head { flex-direction: column; align-items: flex-start; }
  .card-foot { flex-direction: column; align-items: flex-start; gap: 12px; }
}
`;
