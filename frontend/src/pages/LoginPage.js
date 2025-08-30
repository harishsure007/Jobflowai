// src/pages/LoginPage.js
import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import api, { setAuthToken } from "../lib/api";
import { FaLinkedinIn } from "react-icons/fa";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  // Optional LinkedIn OAuth URL (only render button if provided)
  const LINKEDIN_AUTH_URL =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_LINKEDIN_AUTH_URL) ||
    (typeof process !== "undefined" && process.env && process.env.REACT_APP_LINKEDIN_AUTH_URL) ||
    "";

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrMsg("");
    setLoading(true);
    try {
      const payload = { email: (email || "").trim(), password };
      const { data } = await api.post("/api/v1/auth/login", payload);

      // Expecting: { access_token, token_type?: 'bearer' }
      const accessToken = data?.access_token || data?.token || "";
      const rawType = (data?.token_type || "Bearer").trim();
      const tokenType = rawType.toLowerCase() === "bearer" ? "Bearer" : rawType;

      if (!accessToken) throw new Error("No access token returned by server.");

      // Set Authorization header + persist (api.js handles localStorage)
      setAuthToken(accessToken, tokenType);

      // Optional sanity check (ensures token works before redirect)
      await api.get("/api/v1/auth/me");

      // Navigate to intended page or dashboard
      const from = (location.state && location.state.from) || "/dashboard";
      navigate(from, { replace: true });
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Login failed. Please check your email and password.";
      setErrMsg(String(detail));
    } finally {
      setLoading(false);
    }
  };

  const handleLinkedInLogin = () => {
    if (LINKEDIN_AUTH_URL) {
      window.location.href = LINKEDIN_AUTH_URL;
    } else {
      setErrMsg("LinkedIn login requires a backend OAuth URL (LINKEDIN_AUTH_URL).");
    }
  };

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes bgMove {
          0%   { background-position: 0% 0%,     100% 100%; }
          50%  { background-position: 100% 50%,  0%   50%; }
          100% { background-position: 0% 0%,     100% 100%; }
        }
      `}</style>

      <div style={styles.card} role="main" aria-label="Login form">
        <h2 style={styles.title}>🔐 Login to Smart Auto-Apply</h2>

        {errMsg ? (
          <div role="alert" aria-live="assertive" style={styles.errorBox}>
            {errMsg}
          </div>
        ) : null}

        <form onSubmit={handleLogin} style={styles.form} noValidate>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email"
            autoComplete="email"
            style={styles.input}
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-label="Password"
            autoComplete="current-password"
            style={styles.input}
            disabled={loading}
          />

          <div style={styles.forgotRow}>
            <Link to="/forgot-password" style={styles.forgotLink}>
              Forgot Password?
            </Link>
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div style={styles.divider} aria-hidden="true">
          OR
        </div>

        {LINKEDIN_AUTH_URL ? (
          <div style={styles.oauthButtonsRow}>
            <button
              type="button"
              style={{ ...styles.oauthBtn, backgroundColor: "#0077b5", color: "#fff" }}
              onClick={handleLinkedInLogin}
              aria-label="Continue with LinkedIn"
              disabled={loading}
            >
              <FaLinkedinIn style={styles.icon} />
              Continue with LinkedIn
            </button>
          </div>
        ) : null}

        <p style={styles.signupLink}>
          Don’t have an account{" "}
          <Link to="/signup" onClick={(e) => e.stopPropagation()}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f4f8",
    backgroundImage: `
      radial-gradient(900px 600px at 0% 0%, rgba(255,255,255,0.55), transparent 60%),
      radial-gradient(700px 500px at 100% 100%, rgba(42,165,255,0.10), transparent 60%)
    `,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "140% 140%, 140% 140%",
    backgroundPosition: "0% 0%, 100% 100%",
    animation: "bgMove 10s ease-in-out infinite",
    willChange: "background-position",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  card: {
    backgroundColor: "#fff",
    padding: "40px",
    borderRadius: "12px",
    boxShadow: "0 4px 30px rgba(0,0,0,0.05)",
    width: "100%",
    maxWidth: "400px",
    textAlign: "center",
  },
  title: { marginBottom: "24px", color: "#1f3b4d" },
  errorBox: {
    backgroundColor: "#ffe8e8",
    color: "#b00020",
    border: "1px solid #ffc6c6",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "16px",
    textAlign: "left",
    fontSize: "0.95rem",
  },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  input: {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontSize: "1rem",
  },
  button: {
    backgroundColor: "#1f3b4d",
    color: "#fff",
    padding: "12px",
    borderRadius: "8px",
    border: "none",
    fontSize: "1rem",
    cursor: "pointer",
  },
  forgotRow: { textAlign: "right", marginBottom: "8px" },
  forgotLink: { fontSize: "0.9rem", color: "#007bff", textDecoration: "none", cursor: "pointer" },
  divider: { margin: "20px 0", fontWeight: "bold", color: "#aaa" },
  oauthButtonsRow: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" },
  oauthBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "none",
    fontSize: "0.95rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    whiteSpace: "nowrap",
  },
  icon: { fontSize: "1.2rem" },
  signupLink: { marginTop: "20px", fontSize: "0.9rem", color: "#888" },
};

export default LoginPage;