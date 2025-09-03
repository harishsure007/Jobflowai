// src/components/DashboardPage.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/** Resolve your API base from envs (CRA or Vite), default to localhost:8000 */
const RAW_API =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "http://localhost:8000";
const API_BASE = String(RAW_API).replace(/\/+$/, ""); // strip trailing slash(es)

const DashboardPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Dropdown + profile state
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const menuRef = useRef(null);

  // --- Right-side widget state (jobs) ---
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsTotal, setJobsTotal] = useState(null);

  // --- Right-side widget state (news) ---
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [headlines, setHeadlines] = useState([]);

  // Basic query defaults for widgets (you can change later or drive from UI)
  const JOB_QUERY = "data analyst";
  const JOB_LOCATION = "remote";
  const PAGE_SIZE = 50;

  // Active when current path starts with the button path
  const isActive = (path) => location.pathname.startsWith(path);

  // ---- Fetch profile (Bearer token header only; no credentials/cookies) ----
  useEffect(() => {
    let aborted = false;

    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem("token") || "";
        if (!token) {
          if (!aborted) setProfile(null);
          return;
        }

        const res = await fetch(`${API_BASE}/api/v1/profile/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (aborted) return;

        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else if (res.status === 401) {
          localStorage.removeItem("token");
          setProfile(null);
        } else {
          setProfile(null);
        }
      } catch (_) {
        if (!aborted) setProfile(null);
      }
    };

    fetchProfile();
    return () => {
      aborted = true;
    };
  }, []);

  // ---- Fetch jobs for right-side widgets (super simple) ----
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setJobsLoading(true);
      setJobsError("");
      try {
        const u = new URL(`${API_BASE}/api/v1/jobs/search`);
        u.searchParams.set("q", JOB_QUERY);
        u.searchParams.set("location", JOB_LOCATION);
        u.searchParams.set("page", "1");
        u.searchParams.set("page_size", String(PAGE_SIZE));

        const res = await fetch(u.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!isMounted) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setJobs(items);
        setJobsTotal(typeof data?.total === "number" ? data.total : items.length);
      } catch (e) {
        if (isMounted) setJobsError(String(e?.message || e));
      } finally {
        if (isMounted) setJobsLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, []);

  // ---- Fetch live job news headlines (with thumbnails) ----
  useEffect(() => {
    let ok = true;
    async function loadNews() {
      setNewsLoading(true);
      setNewsError("");
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/news/jobs?limit=6&q=job|hiring|recruit|opening|career&strict=true`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (ok) setHeadlines(Array.isArray(data?.items) ? data.items : []);
      } catch (e) {
        if (ok) setNewsError(String(e?.message || e));
      } finally {
        if (ok) setNewsLoading(false);
      }
    }
    loadNews();
    return () => { ok = false; };
  }, []);

  // Count companies (client-side) for widget
  const topCompanies = useMemo(() => {
    const map = new Map();
    for (const j of jobs) {
      const name =
        j?.company ||
        j?.company_name ||
        j?.employer_name ||
        j?.organization ||
        "Unknown";
      map.set(name, (map.get(name) || 0) + 1);
    }
    const arr = Array.from(map.entries()).map(([company, count]) => ({ company, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr.slice(0, 6);
  }, [jobs]);

  // Close dropdown on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const initials = (() => {
    const name = profile?.full_name || "";
    if (!name.trim()) return "👤";
    return name
      .trim()
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 3) || "👤";
  })();

  const goProfile = () => {
    navigate("/profile");
    setMenuOpen(false);
  };

  const signOut = () => {
    if (window.confirm("Sign out of JobFlowAI?")) {
      localStorage.removeItem("token");
      setProfile(null);
      navigate("/login");
    }
    setMenuOpen(false);
  };

  // --- tiny styles for right widgets ---
  const card = {
    borderRadius: 16,
    border: "1px solid #e5e7eb",
    background: "#fff",
    padding: 16,
    boxShadow: "0 6px 20px rgba(15,23,42,.06)",
  };
  const small = { fontSize: 12, color: "#6b7280" };
  const big = { fontSize: 36, fontWeight: 700, lineHeight: 1.1 };
  const listItem = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #f1f5f9",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#fff",
  };
  const linkIcon = {
    fontSize: 14,
    color: "#64748b",
    marginLeft: "auto",
    paddingLeft: 8,
    textDecoration: "none",
  };

  return (
    <>
      <style>
      {`
        * { box-sizing: border-box; }
        html, body, #root { height: 100%; overflow-x: hidden; }  /* <-- prevent horizontal scroll */
        body { margin: 0; padding: 0; font-family: sans-serif; background: #f9f9f9; }

        nav.dashboard-sidebar {
          position: fixed; top: 0; left: 0; height: 100vh; width: 220px;
          background-color: #1f3b4d; color: #fff; padding: 20px;
          display: flex; flex-direction: column; justify-content: space-between;
          box-shadow: 2px 0 8px rgba(0,0,0,0.1); z-index: 1000;
        }
        .sidebar-top { display: flex; flex-direction: column; gap: 20px; min-height: 0; }
        nav.dashboard-sidebar h2 { margin: 0 0 10px 0; font-size: 1.2rem; }
        nav.dashboard-sidebar button.nav-btn {
          display: flex; align-items: center; gap: 12px;
          background-color: #fff; color: #1f3b4d; border: none;
          padding: 10px 20px; border-radius: 30px; font-weight: 500; font-size: 1rem;
          cursor: pointer; transition: background-color .3s, transform .05s;
          text-align: left;
        }
        nav.dashboard-sidebar button.nav-btn:hover { background-color: #e0ecf4; }
        nav.dashboard-sidebar button.nav-btn:active { transform: scale(0.98); }
        nav.dashboard-sidebar button.nav-btn.active { background-color: #e0ecf4; font-weight: 700; }

        .avatar-wrap { position: relative; padding-top: 10px; }
        .avatar-btn { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.15);
          border: none; color: #fff; font-weight: 700; cursor: pointer; }
        .avatar-btn:hover { background: rgba(255,255,255,0.25); }

        .avatar-menu {
          position: absolute; bottom: 54px; left: 0; width: 190px; background: #fff; color: #222;
          border: 1px solid #e5e7eb; border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15); overflow: hidden; z-index: 2000;
        }
        .avatar-item { width: 100%; padding: 10px 14px; background: transparent; border: none;
          display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer; font-size: .95rem; }
        .avatar-item:hover { background: #f5f7fb; }
        .avatar-sep { border-top: 1px solid #eef0f3; margin: 4px 0; }
        .danger { color: #d22; }

        /* FIX: don't exceed viewport width */
        main.dashboard-main {
          margin-left: 220px;             /* offset for the fixed sidebar */
          padding: 40px;
          width: calc(100% - 220px);      /* <-- was 100% (caused overflow) */
          max-width: calc(100% - 220px);  /* extra safety */
        }

        /* === Layout area (adjusted) === */
        .content-wrap {
          display: flex; gap: 16px; align-items: flex-start;
        }
        .left-main {
          flex: 0 1 720px;
          min-width: 0;
        }
        .right-rail {
          width: 360px;
          display: flex; flex-direction: column; gap: 16px;
          margin-left: -40px;            /* pull a bit left, still safe now */
        }

        /* Safety on narrower screens */
        @media (max-width: 1280px) {
          .right-rail { margin-left: -20px; }
        }
        @media (max-width: 1024px) {
          main.dashboard-main { width: 100%; margin-left: 0; }
          .content-wrap { flex-direction: column; }
          .right-rail { width: 100%; margin-left: 0; }
        }
      `}
      </style>

      <nav className="dashboard-sidebar" aria-label="Dashboard navigation">
        <div className="sidebar-top">
          <h2>✨ Job Flow AI</h2>

          <button
            type="button"
            className={`nav-btn ${isActive("/resume-matcher") ? "active" : ""}`}
            aria-current={isActive("/resume-matcher") ? "page" : undefined}
            onClick={() => navigate("/resume-matcher")}
          >
            📄 Resume Matcher
          </button>

          <button
            type="button"
            className={`nav-btn ${isActive("/resume-cover-generator") ? "active" : ""}`}
            aria-current={isActive("/resume-cover-generator") ? "page" : undefined}
            onClick={() => navigate("/resume-cover-generator")}
          >
            ✍️ Resume & Cover Generator
          </button>

          <button
            type="button"
            className={`nav-btn ${isActive("/my-resumes") ? "active" : ""}`}
            aria-current={isActive("/my-resumes") ? "page" : undefined}
            onClick={() => navigate("/my-resumes")}
          >
            📁 My Resumes
          </button>

          <button
            type="button"
            className={`nav-btn ${isActive("/interview-prep") ? "active" : ""}`}
            aria-current={isActive("/interview-prep") ? "page" : undefined}
            onClick={() => navigate("/interview-prep")}
          >
            🗣️ Interview Prep
          </button>

          <button
            type="button"
            className={`nav-btn ${isActive("/mockmate") ? "active" : ""}`}
            aria-current={isActive("/mockmate") ? "page" : undefined}
            onClick={() => navigate("/mockmate")}
          >
            🤖 MockMate
          </button>

          <button
            type="button"
            className={`nav-btn ${isActive("/dashboard/jobs") ? "active" : ""}`}
            aria-current={isActive("/dashboard/jobs") ? "page" : undefined}
            onClick={() => navigate("/dashboard/jobs")}
          >
            💼 Job Postings
          </button>
        </div>

        <div className="avatar-wrap" ref={menuRef}>
          <button
            className="avatar-btn"
            title={profile?.full_name || "Set up Profile"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {initials}
          </button>

          {menuOpen && (
            <div className="avatar-menu">
              <button className="avatar-item" onClick={goProfile}>
                <span>👤</span>
                <span>{profile ? "My Profile" : "Set up Profile"}</span>
              </button>

              <div className="avatar-sep" />

              <button className="avatar-item danger" onClick={signOut}>
                <span>↩︎</span>
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="content-wrap">
          <section className="left-main">
            <h1>Welcome to your Dashboard</h1>
            <p>Use the sidebar to navigate features like resume matching, enhancement, and interview prep.</p>
            {!profile && (
              <p style={{ color: "#666", marginTop: 8 }}>
                Tip: Log in and ensure a token is stored in <code>localStorage</code> to load your profile.
              </p>
            )}
            {profile && (
              <p style={{ color: "#0a6" }}>
                Signed in as <strong>{profile.email || profile.full_name || "User"}</strong>
              </p>
            )}
          </section>

          <aside className="right-rail" aria-label="Jobs quick panel">
            <div style={card}>
              <div style={small}>Today’s New Jobs</div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6 }}>
                <div style={big}>{jobsLoading ? "…" : (jobsTotal ?? "—")}</div>
                <div style={{ color: "#94a3b8", fontSize: 18 }}>🔎</div>
              </div>
              {jobsError ? (
                <div style={{ marginTop: 6, color: "#dc2626", fontSize: 12 }}>Error: {jobsError}</div>
              ) : null}
              <div style={{ marginTop: 4, ...small }}>
                Query: <strong>{JOB_QUERY}</strong> · Location: <strong>{JOB_LOCATION}</strong>
              </div>
            </div>

            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={small}>Top Hiring Companies</div>
                <span style={{ color: "#94a3b8" }}>🏢</span>
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {jobsLoading && topCompanies.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 14 }}>Loading…</div>
                ) : topCompanies.length > 0 ? (
                  topCompanies.map((c) => {
                    const careersUrl = `https://www.google.com/search?q=${encodeURIComponent(
                      `${c.company} careers jobs`
                    )}`;
                    return (
                      <div
                        key={c.company}
                        role="button"
                        tabIndex={0}
                        title={`View jobs at ${c.company}`}
                        onClick={() => navigate(`/dashboard/jobs?company=${encodeURIComponent(c.company)}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/dashboard/jobs?company=${encodeURIComponent(c.company)}`);
                          }
                        }}
                        style={{ ...listItem, cursor: "pointer" }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            paddingRight: 8,
                            color: "#111827",
                          }}
                        >
                          {c.company}
                        </span>
                        <span style={{ fontSize: 12, color: "#6b7280" }}>{c.count}</span>
                        <a
                          href={careersUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Search ${c.company} careers (opens in new tab)`}
                          style={linkIcon}
                          onClick={(e) => e.stopPropagation()}
                          title="Open web careers search ↗"
                        >
                          ↗
                        </a>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: "#94a3b8", fontSize: 14 }}>No companies found.</div>
                )}
              </div>
            </div>

            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={small}>Job News Headlines</div>
                <span style={{ color: "#94a3b8" }}>📰</span>
              </div>

              {newsLoading && <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 8 }}>Loading…</div>}
              {newsError && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>Error: {newsError}</div>}

              {!newsLoading && !newsError && (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                  {headlines.map((h, i) => (
                    <li key={`${h.url || i}`}>
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
                        title={h.source ? `Source: ${h.source}` : undefined}
                      >
                        {h.image ? (
                          <img
                            src={h.image}
                            alt=""
                            style={{
                              width: 46,
                              height: 46,
                              borderRadius: 8,
                              objectFit: "cover",
                              flex: "0 0 46px",
                              border: "1px solid #e5e7eb",
                            }}
                            loading="lazy"
                          />
                        ) : (
                          <div
                            style={{
                              width: 46,
                              height: 46,
                              borderRadius: 8,
                              background: "#f1f5f9",
                              display: "grid",
                              placeItems: "center",
                              color: "#94a3b8",
                              fontSize: 18,
                              flex: "0 0 46px",
                              border: "1px solid #e5e7eb",
                            }}
                            aria-hidden="true"
                          >
                            📰
                          </div>
                        )}
                        <span style={{ color: "#1f2937", fontSize: 14, lineHeight: 1.25 }}>{h.title}</span>
                      </a>
                    </li>
                  ))}
                  {headlines.length === 0 && (
                    <li style={{ color: "#94a3b8", paddingLeft: 4 }}>No headlines available.</li>
                  )}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
};

export default DashboardPage;
