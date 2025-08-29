// src/components/DashboardPage.js
import React, { useState, useEffect, useRef } from "react";
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

  // Active when current path starts with the button path
  const isActive = (path) => location.pathname.startsWith(path);

  // ---- Fetch profile (Bearer token header only; no credentials/cookies) ----
  useEffect(() => {
    let aborted = false;

    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem("token") || "";
        if (!token) {
          // No token yet; skip calling a protected endpoint to avoid CORS/401 noise
          if (!aborted) setProfile(null);
          return;
        }

        const res = await fetch(`${API_BASE}/api/v1/profile/me`, {
          method: "GET",
          // IMPORTANT: do NOT include credentials for Bearer-token auth
          // credentials: "include",  // <-- removed to avoid CORS preflight failure
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (aborted) return;

        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else if (res.status === 401) {
          // Token invalid/expired → clear and keep user unauthenticated in UI
          localStorage.removeItem("token");
          setProfile(null);
        } else {
          // Other server errors
          setProfile(null);
          // Optional: console.error for debugging
          // console.error("Profile fetch failed:", res.status, await res.text());
        }
      } catch (e) {
        if (!aborted) {
          setProfile(null);
          // console.error("Failed to load profile", e);
        }
      }
    };

    fetchProfile();
    return () => {
      aborted = true;
    };
  }, []);

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

  return (
    <>
      <style>
        {`
          * { box-sizing: border-box; }
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

          main.dashboard-main { margin-left: 220px; padding: 40px; flex: 1; width: 100%; }
          @media (max-width: 600px) {
            nav.dashboard-sidebar { position: relative; width: 100%; height: auto; flex-direction: column; }
            main.dashboard-main { margin-left: 0; padding: 20px; }
          }
        `}
      </style>

      <nav className="dashboard-sidebar" aria-label="Dashboard navigation">
        {/* Top section: title + nav buttons */}
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

          {/* 💼 Job Postings */}
          <button
            type="button"
            className={`nav-btn ${isActive("/dashboard/jobs") ? "active" : ""}`}
            aria-current={isActive("/dashboard/jobs") ? "page" : undefined}
            onClick={() => navigate("/dashboard/jobs")}
          >
            💼 Job Postings
          </button>
        </div>

        {/* Bottom section: avatar + dropdown */}
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
        <h1>Welcome to your Dashboard</h1>
        <p>
          Use the sidebar to navigate features like resume matching, enhancement, and interview prep.
        </p>
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
      </main>
    </>
  );
};

export default DashboardPage;
