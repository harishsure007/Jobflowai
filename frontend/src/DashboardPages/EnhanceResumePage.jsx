// src/DashboardPages/EnhanceResumePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { API_BASE, setAuthToken } from "../lib/api"; // ✅ shared client
import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph } from "docx";

const ENHANCE_URL = `/api/v1/enhance/`;
const PARSE_URL = `/api/v1/parse/`;
const SAVE_RESUME_URL = `/api/v1/resume-cover/save`; // ✅ save via resume-cover

/* ---------- helpers ---------- */
const safeText = (v) =>
  v == null
    ? ""
    : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ? String(v)
    : JSON.stringify(v);

function normalizeError(errLike) {
  try {
    // axios timeout uses code ECONNABORTED
    if (errLike?.code === "ECONNABORTED") return "Request timed out. Please try again.";
    const detail =
      errLike?.response?.data?.detail ??
      errLike?.response?.data ??
      errLike?.message ??
      errLike;

    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          const loc = Array.isArray(d.loc) ? d.loc.join(".") : d.loc;
          return `${loc}: ${d.msg || d.type || "error"}`;
        })
        .join(" | ");
    }
    if (detail && typeof detail === "object") {
      if (detail.msg) {
        const loc = Array.isArray(detail.loc) ? detail.loc.join(".") : detail.loc;
        return `${loc || "error"}: ${detail.msg}`;
      }
      return JSON.stringify(detail);
    }
    return String(detail);
  } catch {
    return "Unexpected error";
  }
}

/** Load a TTF font file and return base64 for jsPDF.addFileToVFS */
async function fetchFontAsBase64(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load font: ${path}`);
  const ab = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const EnhanceResumePage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    resumeName: stateName,
    resumeText: stateText,
    missingKeywords: stateMissing = [],
    jdText: jdFromMatcher = "",
  } = location.state || {};

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qpName = query.get("resumeName") || "";
  const qpMissing = (query.get("missing") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const resumeName = stateName || qpName || "resume";
  const missingKeywords =
    Array.isArray(stateMissing) && stateMissing.length ? stateMissing : qpMissing;

  const [resumeText] = useState(stateText || "");
  const [jdText, setJdText] = useState(jdFromMatcher || "");

  const [enhancedResume, setEnhancedResume] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // parser UI
  const [showParsed, setShowParsed] = useState(false);
  const [parseLoading, setParseLoading] = useState(false);
  const [parsedInsights, setParsedInsights] = useState(null);
  const [parseError, setParseError] = useState("");

  // 🔐 Ensure Authorization header is set on mount
  useEffect(() => {
    const t = localStorage.getItem("token") || localStorage.getItem("access_token");
    const type = localStorage.getItem("token_type") || "Bearer";
    if (!t) {
      setError("You’re not logged in. Please sign in to save.");
    } else {
      setAuthToken(t, type);
    }
  }, []);

  // --- Enhance cancellation support ---
  const enhanceCtrlRef = useRef(null);

  useEffect(() => {
    enhanceResume(false);
    return () => {
      try {
        enhanceCtrlRef.current?.abort();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rewrite controls
  const [rewriteExperience, setRewriteExperience] = useState(true);
  const [rewriteStrength, setRewriteStrength] = useState(0.7);

  const enhanceResume = async (isRerun = true) => {
    if (!resumeText?.trim()) {
      setError(
        "Original resume text is missing. Go back to Resume Matcher and click “Enhance My Resume”."
      );
      return;
    }

    // cancel any inflight enhance call
    try {
      enhanceCtrlRef.current?.abort();
    } catch {}
    const ctrl = new AbortController();
    enhanceCtrlRef.current = ctrl;

    setLoading(true);
    if (!isRerun) setEnhancedResume("");
    setError("");

    try {
      const payload = {
        resume_text: resumeText,
        jd_text: jdText || null,
        missing_keywords: missingKeywords || [],
        strategy: isRerun && !rewriteExperience ? "keywords_only" : "rewrite_experience",
        options: { rewrite_strength: rewriteStrength },
      };

      const { data } = await api.post(ENHANCE_URL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 90000,         // ⬅️ give enhance up to 90s
        signal: ctrl.signal,    // ⬅️ cancel support
        validateStatus: () => true,
      });

      if (data?.detail) {
        setError(`❌ ${normalizeError({ response: { data } })}`);
        setEnhancedResume("");
        return;
      }

      const text =
        data?.rewritten_resume ||
        data?.enhanced_resume ||
        data?.improved_resume ||
        data?.text ||
        "";

      if (!text) {
        setError("No content returned by the enhancement service.");
      }
      setEnhancedResume(safeText(text));
    } catch (err) {
      // ignore user-triggered cancellation
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        setError(`❌ ${normalizeError(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const parseCurrent = async () => {
    const textToParse =
      (enhancedResume && String(enhancedResume).trim()) ||
      (resumeText && String(resumeText).trim());
    if (!textToParse) {
      alert("Nothing to parse yet. Enhance or paste resume text first.");
      return;
    }
    setParseLoading(true);
    setParsedInsights(null);
    setParseError("");

    try {
      const form = new FormData();
      form.append("resume_text", textToParse);
      form.append("fuzzy_skills", "true");

      const { data } = await api.post(PARSE_URL, form, {
        // let browser set boundary
        timeout: 45000,          // ⬅️ allow a bit more time
        validateStatus: () => true,
      });

      if (data?.detail) {
        setParseError(normalizeError({ response: { data } }));
        setParsedInsights(null);
        setShowParsed(true);
        return;
      }
      setParsedInsights(data);
      setShowParsed(true);
    } catch (err) {
      setParseError(normalizeError(err));
      setParsedInsights(null);
      setShowParsed(true);
    } finally {
      setParseLoading(false);
    }
  };

  const saveToLibrary = async () => {
    if (!enhancedResume?.trim()) {
      alert("Nothing to save yet. Please enhance first.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        doc_type: "resume",
        resume_title: `${resumeName}_enhanced`,
        resume_text: enhancedResume,
        resume_source: "enhancer",
      };
      // For debugging:
      console.log("POST", `${API_BASE}${SAVE_RESUME_URL}`, payload);
      const { data, status } = await api.post(SAVE_RESUME_URL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,          // ⬅️ 30s for DB save
        validateStatus: () => true,
      });
      if (status >= 400 || data?.detail) {
        throw { response: { data, status } };
      }
      alert("✅ Saved to My Resumes!");
      navigate("/my-resumes");
    } catch (err) {
      alert(`❌ ${normalizeError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const downloadPDF = async () => {
    if (!enhancedResume) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const regularB64 = await fetchFontAsBase64("/fonts/NotoSans-VariableFont_wdth,wght.ttf");
    doc.addFileToVFS("NotoSans-Regular.ttf", regularB64);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    try {
      const italicB64 = await fetchFontAsBase64("/fonts/NotoSans-Italic-VariableFont_wdth,wght.ttf");
      doc.addFileToVFS("NotoSans-Italic.ttf", italicB64);
      doc.addFont("NotoSans-Italic.ttf", "NotoSans", "italic");
    } catch {}
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(11);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const lineHeight = 16;
    const maxLineWidth = pageWidth - margin * 2;

    const lines = doc.splitTextToSize(String(enhancedResume), maxLineWidth);
    let cursorY = margin;
    for (const line of lines) {
      if (cursorY + lineHeight > pageHeight - margin) {
        doc.addPage();
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(11);
        cursorY = margin;
      }
      doc.text(line, margin, cursorY, { baseline: "top" });
      cursorY += lineHeight;
    }
    doc.save(`${resumeName}_enhanced.pdf`);
  };

  const downloadTXT = () => {
    if (!enhancedResume) return;
    const blob = new Blob([String(enhancedResume)], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${resumeName}_enhanced.txt`);
  };

  const downloadDOCX = async () => {
    if (!enhancedResume) return;
    const doc = new Document({
      sections: [{ children: [new Paragraph(String(enhancedResume))] }],
    });
    const buffer = await Packer.toBlob(doc);
    saveAs(buffer, `${resumeName}_enhanced.docx`);
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h2 style={styles.header}>
            <span role="img" aria-label="resume">✨</span> Resume Enhancement
          </h2>
          <div style={styles.fileName}>
            File:&nbsp;<span style={{ color: "#2563eb" }}>{safeText(resumeName) || "N/A"}</span>
          </div>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.switchRow}>
              <label style={styles.switchLabel}>
                <input
                  type="checkbox"
                  checked={rewriteExperience}
                  onChange={(e) => setRewriteExperience(e.target.checked)}
                />
                <span>
                  <strong>Rewrite&nbsp;Experience</strong> bullets with missing skills from JD
                </span>
              </label>
            </div>

            <div style={styles.sliderRow}>
              <label htmlFor="strength" style={styles.sliderLabel}>
                Rewrite strength
              </label>
              <div style={styles.sliderWrap}>
                <input
                  id="strength"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(rewriteStrength * 100)}
                  onChange={(e) => setRewriteStrength(Number(e.target.value) / 100)}
                  style={styles.slider}
                />
                <span style={styles.sliderValue}>{Math.round(rewriteStrength * 100)}%</span>
              </div>
            </div>
          </div>

          <div style={styles.jdBlock}>
            <label htmlFor="jdctx" style={styles.jdLabel}>
              Job Description context <span style={{ color: "#6b7280" }}>(optional, used for rewriting)</span>
            </label>
            <textarea
              id="jdctx"
              placeholder="Paste the JD here to tailor your Summary & Experience bullet points."
              rows={5}
              style={styles.jdTextarea}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
            />
          </div>

          <button
            onClick={() => enhanceResume(true)}
            style={styles.rerunBtn}
            disabled={loading}
            type="button"
            title="Run enhancement with the current settings"
          >
            {loading ? "Re-running…" : "🔄 Re-run with these settings"}
          </button>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{safeText(error)}</pre>
            {!resumeText && (
              <div style={{ marginTop: 8 }}>
                <button style={styles.secondaryBtn} onClick={() => navigate("/resume-matcher")}>
                  ← Go back to Resume Matcher
                </button>
              </div>
            )}
          </div>
        )}

        <div style={styles.outputCard}>
          {loading ? (
            <p style={styles.loading}>⏳ Enhancing your resume…</p>
          ) : (
            <textarea
              rows={22}
              style={styles.outputTextarea}
              value={safeText(enhancedResume)}
              readOnly
              placeholder={error ? "No enhanced resume to show." : "Enhanced resume will appear here."}
            />
          )}

          <div style={styles.footerBar}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => navigate(-1)} style={styles.ghostBtn} aria-label="Go back">
                ← Back
              </button>
              <button
                onClick={saveToLibrary}
                style={styles.saveBtn}
                disabled={!enhancedResume || saving}
                aria-label="Save enhanced resume to library"
              >
                {saving ? "Saving…" : "💾 Save to My Resumes"}
              </button>
            </div>

            <div style={styles.downloadGroup}>
              <button onClick={downloadPDF} style={styles.primaryBtn} disabled={!enhancedResume}>
                📄 PDF
              </button>
              <button onClick={downloadDOCX} style={styles.primaryBtn} disabled={!enhancedResume}>
                📃 DOCX
              </button>
              <button onClick={downloadTXT} style={styles.primaryBtn} disabled={!enhancedResume}>
                📝 TXT
              </button>
            </div>
          </div>
        </div>

        {/* Parsed Insights */}
        <div style={styles.parsedCard}>
          <div style={styles.parsedHeader}>
            <h3 style={{ margin: 0 }}>🧠 Parsed Insights</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={styles.secondaryBtn}
                onClick={() => setShowParsed((v) => !v)}
                type="button"
              >
                {showParsed ? "Hide" : "Show"}
              </button>
              <button
                style={styles.primaryBtn}
                onClick={parseCurrent}
                disabled={parseLoading}
                type="button"
              >
                {parseLoading ? "Parsing…" : "🔍 Parse current draft"}
              </button>
            </div>
          </div>

          {showParsed && (
            <div style={{ marginTop: 10 }}>
              {parseError && (
                <div
                  style={{
                    margin: "8px 0 12px",
                    background: "#FEF2F2",
                    color: "#991B1B",
                    border: "1px solid #FCA5A5",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{safeText(parseError)}</pre>
                </div>
              )}

              {!parseError && !parsedInsights && (
                <p style={{ color: "#64748b" }}>
                  Click “Parse current draft” to extract skills, education, and experience structure.
                </p>
              )}

              {!parseError && parsedInsights && (
                <div style={styles.parsedGrid}>
                  <div style={styles.parsedCol}>
                    <div style={styles.parsedSection}>
                      <div style={styles.parsedTitle}>Identity</div>
                      <div><strong>Name:</strong> {safeText(parsedInsights?.name) || "—"}</div>
                      <div><strong>Email:</strong> {safeText(parsedInsights?.email) || "—"}</div>
                      <div><strong>Phone:</strong> {safeText(parsedInsights?.phone) || "—"}</div>
                    </div>

                    <div style={styles.parsedSection}>
                      <div style={styles.parsedTitle}>Skills</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(parsedInsights?.skills || []).slice(0, 20).map((s, i) => (
                          <span key={i} style={styles.skillChip}>{safeText(s)}</span>
                        ))}
                        {(parsedInsights?.skills || []).length === 0 && <span>—</span>}
                      </div>
                    </div>
                  </div>

                  <div style={styles.parsedCol}>
                    <div style={styles.parsedSection}>
                      <div style={styles.parsedTitle}>Education</div>
                      {(parsedInsights?.education || []).length === 0 && <div>—</div>}
                      {(parsedInsights?.education || []).map((e, i) => (
                        <div key={i} style={styles.eduItem}>
                          <div style={{ fontWeight: 600 }}>{safeText(e?.degree) || "—"}</div>
                          <div>{safeText(e?.school) || "—"}</div>
                          <div style={{ color: "#64748b" }}>
                            {[safeText(e?.location), safeText(e?.start), safeText(e?.end || e?.year)]
                              .filter(Boolean)
                              .join(" • ") || "—"}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={styles.parsedSection}>
                      <div style={styles.parsedTitle}>Experience</div>
                      {(parsedInsights?.experience || []).length === 0 && <div>—</div>}
                      {(parsedInsights?.experience || []).map((ex, i) => (
                        <div key={i} style={styles.expItem}>
                          <div style={{ fontWeight: 700 }}>
                            {safeText(ex?.title) || "—"}{" "}
                            <span style={{ fontWeight: 400 }}>
                              @ {safeText(ex?.company) || "—"}
                            </span>
                          </div>
                          <div style={{ color: "#64748b" }}>
                            {[safeText(ex?.location), safeText(ex?.start), safeText(ex?.end)]
                              .filter(Boolean)
                              .join(" • ") || "—"}
                          </div>
                          <ul style={styles.bulletList}>
                            {(ex?.bullets || []).slice(0, 6).map((b, j) => (
                              <li key={j}>{safeText(b)}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* /Parsed Insights */}
      </div>
    </div>
  );
};

const styles = {
  page: { background: "#fbf7f2", minHeight: "100vh", padding: "32px 20px", display: "flex", justifyContent: "center" },
  container: { width: "min(1100px, 100%)" },
  headerRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
  header: { margin: 0, fontSize: "1.9rem", color: "#0f172a", letterSpacing: ".2px" },
  fileName: { color: "#334155", fontSize: ".95rem" },

  panel: { background: "#fff", borderRadius: 12, boxShadow: "0 6px 20px rgba(15,23,42,.08)", border: "1px solid #eef2f7", padding: 16, marginBottom: 16 },
  panelHeader: { display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "center" },
  switchRow: { display: "flex", alignItems: "center" },
  switchLabel: { display: "flex", alignItems: "center", gap: 10, fontWeight: 600, color: "#0f172a" },
  sliderRow: { display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" },
  sliderLabel: { fontWeight: 600, color: "#0f172a" },
  sliderWrap: { display: "flex", alignItems: "center", gap: 10, minWidth: 220 },
  slider: { width: 160, accentColor: "#2563eb" },
  sliderValue: { minWidth: 44, textAlign: "center", fontVariantNumeric: "tabular-nums", color: "#2563eb", fontWeight: 700 },

  jdBlock: { marginTop: 12 },
  jdLabel: { display: "block", marginBottom: 6, fontWeight: 600, color: "#0f172a" },
  jdTextarea: { width: "100%", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fbfdff", padding: "10px 12px", fontSize: "0.95rem", resize: "vertical", boxShadow: "inset 0 1px 0 rgba(0,0,0,.02)" },

  rerunBtn: { width: "100%", marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#0f172a", color: "#fff", border: "1px solid #0f172a", fontWeight: 700, cursor: "pointer" },

  errorBox: { marginTop: 12, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px" },

  outputCard: { marginTop: 16, background: "#fff", borderRadius: 12, border: "1px solid #eef2f7", boxShadow: "0 6px 20px rgba(15,23,42,.08)", overflow: "hidden" },
  loading: { padding: 16, color: "#374151" },
  outputTextarea: { width: "100%", height: "60vh", minHeight: 360, padding: 16, border: "none", outline: "none", fontSize: "0.98rem", lineHeight: 1.55, background: "#fcfcff", whiteSpace: "pre-wrap" },

  footerBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: "1px solid #eef2f7", background: "#f8fafc", flexWrap: "wrap" },
  ghostBtn: { padding: "10px 12px", background: "transparent", border: "1px solid #cbd5e1", color: "#0f172a", borderRadius: 10, cursor: "pointer" },
  saveBtn: { padding: "10px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700 },

  downloadGroup: { display: "flex", gap: 8, flexWrap: "wrap" },
  primaryBtn: { padding: "10px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600 },
  secondaryBtn: { padding: "8px 12px", background: "#eef2ff", border: "1px solid #c7d2fe", color: "#1e3a8a", borderRadius: 10, cursor: "pointer" },

  parsedCard: { marginTop: 16, background: "#fff", borderRadius: 12, border: "1px solid #eef2f7", boxShadow: "0 6px 20px rgba(15,23,42,.08)", padding: 16 },
  parsedHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  parsedGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 },
  parsedCol: { display: "flex", flexDirection: "column", gap: 12 },
  parsedSection: { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fbfdff" },
  parsedTitle: { fontWeight: 700, marginBottom: 6, color: "#0f172a" },
  skillChip: { background: "#e0f2fe", color: "#075985", padding: "6px 10px", borderRadius: 999, fontSize: "0.85rem" },
  eduItem: { marginBottom: 8 },
  expItem: { marginBottom: 12 },
  bulletList: { margin: "6px 0 0 16px" },
};

export default EnhanceResumePage;
