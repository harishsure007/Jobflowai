// src/DashboardPages/ResumeCoverGenerator.jsx
import React, { useState } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph } from "docx";
import { jsPDF } from "jspdf";
/* -------------------- API base (CRA or Vite) -------------------- */
const RAW_API =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "http://127.0.0.1:8000";
const API_BASE = String(RAW_API).replace(/\/+$/, "");

/* -------------------- Small utils -------------------- */
const stripCodeFences = (s = "") =>
  String(s).replace(/^```[a-z]*\s*|\s*```$/gim, "").trim();

function safeText(v) {
  return v == null
    ? ""
    : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ? String(v)
    : JSON.stringify(v);
}

function normalizeError(errLike) {
  try {
    const status =
      errLike?.response?.status || errLike?.status || errLike?.response?.data?.status;
    const detail =
      errLike?.response?.data?.detail ??
      errLike?.response?.data ??
      errLike?.data?.detail ??
      errLike?.data ??
      errLike?.message ??
      errLike;

    let msg;
    if (Array.isArray(detail)) {
      msg = detail
        .map((d) => {
          const loc = Array.isArray(d.loc) ? d.loc.join(".") : d.loc;
          return `${loc || "error"}: ${d.msg || d.type || "error"}`;
        })
        .join(" | ");
    } else if (detail && typeof detail === "object") {
      if (detail.msg) {
        const loc = Array.isArray(detail.loc) ? detail.loc.join(".") : detail.loc;
        msg = `${loc || "error"}: ${detail.msg}`;
      } else {
        msg = JSON.stringify(detail);
      }
    } else {
      msg = String(detail ?? "Unknown error");
    }

    if (status === 401 || status === 403) {
      return `Missing or invalid Authorization header. Please log in again. (${msg})`;
    }
    return msg;
  } catch {
    return "Unexpected error";
  }
}

function detectDocTypeFromCommand(cmd = "") {
  const lc = cmd.toLowerCase();
  const mentionsResume = /(resume|cv)\b/.test(lc);
  const mentionsCover = /(cover\s*letter|cover-letter|cover)\b/.test(lc);
  if (mentionsResume && mentionsCover) return "both";
  if (mentionsCover) return "cover";
  if (mentionsResume) return "resume";
  return "both";
}

/* -------------------- Component -------------------- */
export default function ResumeCoverGenerator() {
  const [command, setCommand] = useState("");
  const [jdText, setJdText] = useState("");
  const [docType, setDocType] = useState("auto");

  // include_profile toggle and per-run contact overrides
  const [useProfile, setUseProfile] = useState(true);
  const [overrides, setOverrides] = useState({
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resumeText, setResumeText] = useState("");
  const [coverText, setCoverText] = useState("");

  /* -------------------- Network helpers -------------------- */
  // 🔧 Fix: read both "access_token" (new) and "token" (legacy)
  const getToken = () => {
    const t1 = (localStorage.getItem("access_token") || "").trim();
    const t2 = (localStorage.getItem("token") || "").trim();
    return t1 || t2;
  };

  async function postJSON(url, body, opts = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(body),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = { detail: await res.text() };
    }
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`);
      e.response = { status: res.status, data };
      throw e;
    }
    return data;
  }

  async function postJSONAuth(url, body) {
    const token = getToken();
    if (!token) {
      const e = new Error("No token");
      e.response = { status: 401, data: { detail: "No JWT in localStorage" } };
      throw e;
    }
    return postJSON(url, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Works with or without token. (With token = profile injection)
  async function postJSONMaybeAuth(url, body) {
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return postJSON(url, body, { headers });
  }

  /* -------------------- Helpers: build payload -------------------- */
  function buildGeneratePayload() {
    const resolvedType = docType === "auto" ? detectDocTypeFromCommand(command) : docType;

    // Only include non-empty overrides
    const cleanOverrides = Object.fromEntries(
      Object.entries(overrides).filter(([_, v]) => String(v || "").trim() !== "")
    );

    const payload = {
      command: command || "Generate professional documents",
      doc_type: resolvedType,
      jd_text: jdText || "",
      include_profile: !!useProfile,
    };

    // required by backend
    payload.role_or_target = (command || "").trim() || "General Candidate";

    if (Object.keys(cleanOverrides).length > 0) {
      payload.contact_overrides = cleanOverrides;
    }

    return payload;
  }

  /* -------------------- Generate (maybe authed) -------------------- */
  const onGenerate = async () => {
    if (!command.trim() && !jdText.trim()) {
      alert("Please type a command or paste a JD.");
      return;
    }
    setLoading(true);
    setError("");
    setResumeText("");
    setCoverText("");

    try {
      const payload = buildGeneratePayload();

      const data = await postJSONMaybeAuth(`${API_BASE}/api/v1/resume-cover`, payload);

      console.log("[resume-cover] response:", data);

      const resume =
        data?.resume ??
        data?.resume_text ??
        data?.resumeBody ??
        data?.result?.resume ??
        "";

      const cover =
        data?.cover_letter ??
        data?.cover ??
        data?.cover_text ??
        data?.result?.cover_letter ??
        "";

      setResumeText(stripCodeFences(resume));
      setCoverText(stripCodeFences(cover));

      if (!resume && !cover) {
        setError("No resume/cover fields found in response. Showing raw JSON below.");
        setResumeText(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- Save -------------------- */
  const saveToLibrary = async () => {
    const hasResume = !!resumeText?.trim();
    const hasCover = !!coverText?.trim();
    if (!hasResume && !hasCover) {
      alert("Nothing to save.");
      return;
    }

    try {
      let payload;
      if (hasResume && hasCover) {
        payload = {
          doc_type: "both",
          resume_title: "generated_resume",
          resume_text: resumeText,
          cover_title: "generated_cover_letter",
          cover_text: coverText,
        };
      } else if (hasResume) {
        payload = {
          doc_type: "resume",
          resume_title: "generated_resume",
          resume_text: resumeText,
        };
      } else {
        payload = {
          doc_type: "cover",
          cover_title: "generated_cover_letter",
          cover_text: coverText,
        };
      }

      const res = await postJSONAuth(`${API_BASE}/api/v1/resume-cover/save`, payload);
      alert(
        `✅ Saved!${
          res.resume_id ? ` Resume ID: ${res.resume_id}` : ""
        }${res.cover_id ? ` | Cover ID: ${res.cover_id}` : ""}`.trim()
      );
    } catch (e) {
      // clearer message on auth problems / server errors
      alert(`❌ Save failed: ${normalizeError(e)}`);
    }
  };

  /* -------------------- Downloads -------------------- */
  const downloadTXT = (name, text) => {
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${name}.txt`);
  };

  const downloadDOCX = async (name, text) => {
    if (!text) return;
    const doc = new Document({ sections: [{ children: [new Paragraph(text)] }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${name}.docx`);
  };


  const downloadPDF = (name, text) => {
    if (!text) return;
  
    // A4, points. Change to { unit: "mm", format: "a4" } if you prefer mm.
    const doc = new jsPDF({ unit: "pt", format: "a4" });
  
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    const lineHeight = 16;
  
    // Wrap long lines to fit page width
    const wrapped = doc.splitTextToSize(String(text), maxWidth);
  
    let y = margin;
    wrapped.forEach(line => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });
  
    doc.save(`${name || "document"}.pdf`);
  };
  

  /* -------------------- UI -------------------- */
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h2 style={styles.title}>✍️ Resume & Cover Generator</h2>

        <div style={styles.card}>
          <div style={styles.row}>
            <label style={styles.label}>Your Command</label>
            <input
              type="text"
              placeholder={`e.g., "Generate a resume for mid-level Data Analyst"`}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              style={styles.select}
            >
              <option value="auto">Auto (from command)</option>
              <option value="resume">Resume</option>
              <option value="cover">Cover Letter</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Profile</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={useProfile}
                  onChange={(e) => setUseProfile(e.target.checked)}
                />
                Use my saved profile (inject name/email/phone/links)
              </label>
              <a href="/profile" style={{ textDecoration: "none", fontWeight: 600 }}>
                Edit Profile →
              </a>
            </div>
          </div>

          <details style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              Contact overrides (optional)
            </summary>
            <p style={{ marginTop: 6, color: "#475569" }}>
              These apply only to this generation and override your saved profile.
            </p>
            <div style={styles.grid2}>
              {[
                ["full_name", "Full name"],
                ["email", "Email"],
                ["phone", "Phone"],
                ["location", "Location"],
                ["linkedin", "LinkedIn URL"],
                ["github", "GitHub URL"],
                ["portfolio", "Portfolio URL"],
              ].map(([k, label]) => (
                <input
                  key={k}
                  placeholder={label}
                  value={overrides[k]}
                  onChange={(e) =>
                    setOverrides((o) => ({ ...o, [k]: e.target.value }))
                  }
                  style={styles.input}
                />
              ))}
            </div>
          </details>

          <div style={styles.rowCol}>
            <label style={styles.label}>(Optional) Paste Job Description</label>
            <textarea
              rows={6}
              placeholder="Paste JD here to tailor output"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              style={styles.textarea}
            />
          </div>

          <button onClick={onGenerate} disabled={loading} style={styles.primaryBtn}>
            {loading ? "Generating…" : "Generate"}
          </button>

          {error && (
            <div style={styles.error}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{safeText(error)}</pre>
            </div>
          )}
        </div>

        {(resumeText || coverText) && (
          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            {resumeText && (
              <div style={styles.outputCard}>
                <div style={styles.outputHeader}>
                  <h3 style={{ margin: 0 }}>📄 Resume</h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={styles.ghostBtn} onClick={saveToLibrary}>
                      💾 Save
                    </button>
                    <button
                      style={styles.ghostBtn}
                      onClick={() => downloadDOCX("generated_resume", resumeText)}
                    >
                      📃 DOCX
                    </button>
                    <button
                      style={styles.ghostBtn}
                      onClick={() => downloadTXT("generated_resume", resumeText)}
                    >
                      📝 TXT
                    </button>
                    <button
                      style={styles.ghostBtn}
                      onClick={() => downloadPDF("generated_resume", resumeText)}
                    >
                      📄 PDF
                    </button>
                  </div>
                </div>
                <textarea value={resumeText} readOnly style={styles.outputArea} />
              </div>
            )}

            {coverText && (
              <div style={styles.outputCard}>
                <div style={styles.outputHeader}>
                  <h3 style={{ margin: 0 }}>💌 Cover Letter</h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={styles.ghostBtn} onClick={saveToLibrary}>
                      💾 Save
                    </button>
                    <button
                      style={styles.ghostBtn}
                      onClick={() => downloadDOCX("generated_cover_letter", coverText)}
                    >
                      📃 DOCX
                    </button>
                    <button
                      style={styles.ghostBtn}
                      onClick={() => downloadTXT("generated_cover_letter", coverText)}
                    >
                      📝 TXT
                    </button>

                    <button
                      style={styles.ghostBtn}
                      onClick={() => downloadPDF("generated_cover_letter", coverText)}
                    >
                      📄 PDF
                    </button>
                  </div>
                </div>
                <textarea value={coverText} readOnly style={styles.outputArea} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Styles -------------------- */
const styles = {
  page: { minHeight: "100vh", background: "#f6fbff", padding: 24 },
  container: { maxWidth: 1100, margin: "0 auto" },
  title: { margin: 0, marginBottom: 12, color: "#0f172a" },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    boxShadow: "0 8px 20px rgba(2,6,23,.05)",
    padding: 16,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  rowCol: { display: "grid", gap: 8, marginTop: 6, marginBottom: 10 },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 12,
    marginTop: 8,
  },
  label: { fontWeight: 600, color: "#0f172a" },
  input: { width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" },
  select: { width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" },
  textarea: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    resize: "vertical",
  },
  primaryBtn: {
    width: "100%",
    marginTop: 8,
    padding: "10px 14px",
    background: "#0f172a",
    color: "#fff",
    borderRadius: 10,
    border: "1px solid #0f172a",
    fontWeight: 700,
    cursor: "pointer",
  },
  error: {
    marginTop: 10,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: "8px 12px",
  },
  outputCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    boxShadow: "0 8px 20px rgba(2,6,23,.05)",
    overflow: "hidden",
  },
  outputHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
  outputArea: {
    width: "100%",
    minHeight: 280,
    border: "none",
    outline: "none",
    padding: 12,
    background: "#fcfcff",
    whiteSpace: "pre-wrap",
  },
  ghostBtn: {
    padding: "8px 10px",
    background: "transparent",
    border: "1px solid #cbd5e1",
    color: "#0f172a",
    borderRadius: 10,
    cursor: "pointer",
  },
};
