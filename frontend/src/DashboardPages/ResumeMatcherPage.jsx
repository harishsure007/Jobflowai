// src/pages/ResumeMatcherPage.js
import React, { useState } from "react";
import { FaFilePdf, FaFileWord, FaFileAlt, FaTimes } from "react-icons/fa";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const COMPARE_URL = `${API_BASE}/api/v1/compare/`; // FastAPI router endpoint
const PARSE_URL = `${API_BASE}/api/v1/parse/`;     // <-- Parser endpoint

const ResumeMatcherPage = () => {
  const [resumes, setResumes] = useState([]);
  const [jobDescriptionFile, setJobDescriptionFile] = useState(null);
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [comparisonResult, setComparisonResult] = useState(null);
  const [jdText, setJdText] = useState(""); // ✅ store JD text from backend
  const [loading, setLoading] = useState(false);
  const [comparisonType, setComparisonType] = useState("word");
  const navigate = useNavigate();

  // ---- Parsed Insights state (first resume only) ----
  const [showInsights, setShowInsights] = useState(true);
  const [parsed, setParsed] = useState(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState(null);

  // ---- helpers for parser ----
  const safeErr = async (res) => {
    try {
      const t = await res.text();
      try {
        const j = JSON.parse(t);
        return j?.detail || t || res.statusText;
      } catch {
        return t || res.statusText;
      }
    } catch {
      return res.statusText;
    }
  };

  const parseSelectedResume = async (file) => {
    const form = new FormData();
    form.append("resume_file", file);
    form.append("fuzzy_skills", "true");
    const res = await fetch(PARSE_URL, { method: "POST", body: form });
    if (!res.ok) throw new Error(await safeErr(res));
    return res.json();
  };

  // Handles multiple resume files upload
  const handleResumeUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length + resumes.length > 3) {
      alert("⚠️ You can upload up to 3 resumes.");
      return;
    }
    const filesWithMeta = files.map((file) => ({ file }));
    const next = [...resumes, ...filesWithMeta];
    setResumes(next);

    // Auto-parse first resume if insights are enabled
    if (showInsights) {
      const firstFile = next[0]?.file;
      if (firstFile) {
        try {
          setParseLoading(true);
          setParseError(null);
          const data = await parseSelectedResume(firstFile);
          setParsed(data);
        } catch (err) {
          setParsed(null);
          setParseError(err.message || "Could not parse this resume.");
        } finally {
          setParseLoading(false);
        }
      } else {
        setParsed(null);
        setParseError(null);
      }
    }
  };

  const removeResume = async (indexToRemove) => {
    const next = resumes.filter((_, i) => i !== indexToRemove);
    setResumes(next);

    // If we removed the first resume, refresh insights accordingly
    if (showInsights) {
      const firstFile = next[0]?.file;
      if (!firstFile) {
        setParsed(null);
        setParseError(null);
      } else {
        try {
          setParseLoading(true);
          setParseError(null);
          const data = await parseSelectedResume(firstFile);
          setParsed(data);
        } catch (err) {
          setParsed(null);
          setParseError(err.message || "Could not parse this resume.");
        } finally {
          setParseLoading(false);
        }
      }
    }
  };

  const handleInsightsToggle = async (e) => {
    const on = e.target.checked;
    setShowInsights(on);
    if (on) {
      const firstFile = resumes[0]?.file;
      if (firstFile) {
        try {
          setParseLoading(true);
          setParseError(null);
          const data = await parseSelectedResume(firstFile);
          setParsed(data);
        } catch (err) {
          setParsed(null);
          setParseError(err.message || "Could not parse this resume.");
        } finally {
          setParseLoading(false);
        }
      }
    }
  };

  const handleJobDescriptionUpload = (e) => {
    const file = (e.target.files || [])[0];
    setJobDescriptionFile(file || null);
    setJobDescriptionText("");
  };

  const removeJobDescriptionFile = () => setJobDescriptionFile(null);

  const handleJobDescriptionText = (e) => {
    setJobDescriptionText(e.target.value);
    setJobDescriptionFile(null);
  };

  const handleClear = () => {
    setResumes([]);
    setJobDescriptionFile(null);
    setJobDescriptionText("");
    setComparisonResult(null);
    setJdText("");
    setParsed(null);
    setParseError(null);
  };

  // Compare resumes with JD
  const handleCompare = async () => {
    if (resumes.length === 0) {
      alert("Please upload at least one resume.");
      return;
    }
    if (!jobDescriptionFile && !jobDescriptionText.trim()) {
      alert("Please upload or paste a job description.");
      return;
    }

    setLoading(true);
    setComparisonResult(null);

    const formData = new FormData();
    resumes.forEach(({ file }) => formData.append("resumes", file));
    if (jobDescriptionFile) formData.append("jd_file", jobDescriptionFile);
    else formData.append("jd_text", jobDescriptionText);

    formData.append("comparison_type", comparisonType);

    try {
      const response = await axios.post(COMPARE_URL, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data?.results) {
        setComparisonResult(response.data.results);
        setJdText(response.data.jd_text || ""); // ✅ capture JD text from backend
      } else {
        console.warn("Unexpected response shape:", response.data);
        alert("❌ Invalid response from backend.");
      }
    } catch (error) {
      console.error("❌ Error comparing:", error);
      const msg =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Comparison failed. Please check backend logs.";
      alert(`❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (fileName = "") => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return <FaFilePdf color="#e63946" style={styles.fileIcon} title="PDF file" />;
    if (ext === "doc" || ext === "docx")
      return <FaFileWord color="#1e40af" style={styles.fileIcon} title="Word document" />;
    if (ext === "txt") return <FaFileAlt color="#2a9d8f" style={styles.fileIcon} title="Text file" />;
    return <FaFileAlt style={styles.fileIcon} title="File" />;
  };

  // ✅ Pass JD text forward too
  const goToEnhance = (resumeName, missingKeywords, resumeText) => {
    navigate("/enhance-resume", {
      state: {
        resumeName,
        missingKeywords,
        resumeText,
        jdText, // 👈 include JD text for enhancer
      },
    });
  };

  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <h2 style={styles.header}>📄 Resume Matcher</h2>

        {/* Resume Upload */}
        <section style={styles.card}>
          <label htmlFor="resume-upload" style={styles.label}>
            Upload Resumes (max 3)
          </label>
          <input
            id="resume-upload"
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            multiple
            onChange={handleResumeUpload}
          />
          <div style={styles.filePreview}>
            {resumes.map(({ file }, idx) => (
              <div key={idx} style={styles.fileItem}>
                {getFileIcon(file?.name)}
                <span
                  title={file?.name}
                  style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {file?.name}
                </span>
                <button style={styles.xBtn} onClick={() => removeResume(idx)} type="button">
                  <FaTimes />
                </button>
              </div>
            ))}
          </div>

          {/* Toggle insights */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              id="toggle-insights"
              checked={showInsights}
              onChange={handleInsightsToggle}
            />
            <label htmlFor="toggle-insights" style={{ marginLeft: 8, cursor: "pointer" }}>
              Show Parsed Insights (first resume)
            </label>
          </div>

          {/* Insights panel */}
          {showInsights && (
            <div style={{ marginTop: 12 }}>
              {parseLoading && <div>Parsing resume…</div>}
              {parseError && <div style={{ color: "tomato" }}>⚠ {parseError}</div>}
              {parsed && <ParsedInsights parsed={parsed} />}
            </div>
          )}
        </section>

        {/* Job Description Upload */}
        <section style={styles.card}>
          <label htmlFor="jd-upload" style={styles.label}>
            Upload Job Description
          </label>
          <input id="jd-upload" type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleJobDescriptionUpload} />
          {jobDescriptionFile && (
            <div style={styles.fileItem}>
              {getFileIcon(jobDescriptionFile.name)}
              <span
                title={jobDescriptionFile.name}
                style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {jobDescriptionFile.name}
              </span>
              <button style={styles.xBtn} onClick={removeJobDescriptionFile} type="button">
                <FaTimes />
              </button>
            </div>
          )}
        </section>

        {/* JD Textarea */}
        <section style={styles.card}>
          <label htmlFor="jd-text" style={styles.label}>
            Or Paste Job Description
          </label>
          <textarea
            id="jd-text"
            placeholder="Paste job description..."
            rows={5}
            style={styles.textarea}
            value={jobDescriptionText}
            onChange={handleJobDescriptionText}
          />
        </section>

        {/* Type Selector */}
        <section style={styles.card}>
          <label htmlFor="comparison-type" style={styles.label}>
            Comparison Type
          </label>
          <select
            id="comparison-type"
            style={styles.selectBox}
            value={comparisonType}
            onChange={(e) => setComparisonType(e.target.value)}
          >
            <option value="word">Word-to-Word</option>
            <option value="skill">Skill Match</option>
            <option value="overall">Overall Match</option>
          </select>
        </section>

        {/* Buttons */}
        <div style={styles.actions}>
          <button style={styles.clearBtn} onClick={handleClear} type="button">
            🔄 Clear
          </button>
          <button style={styles.compareBtn} onClick={handleCompare} disabled={loading} type="button">
            {loading ? "Comparing..." : "🔍 Compare"}
          </button>
        </div>
      </aside>

      {/* Results */}
      <main style={styles.content}>
        <h3>🧠 Comparison Output</h3>
        {loading && <p>⏳ Comparing resumes with job description...</p>}

        {!loading && comparisonResult?.length === 0 && <p>No resumes to compare.</p>}

        {!loading && comparisonResult?.length > 0 && (
          <div>
            {comparisonResult.map((result, idx) => (
              <div key={idx} style={styles.resultCard}>
                <h4>📄 {result.fileName}</h4>
                <p>
                  <strong>Match:</strong> {result.match_percentage}%
                </p>

                <p>
                  <strong>✅ Matched Keywords:</strong>
                </p>
                <div style={styles.keywordBox}>
                  {(result.matched_keywords || []).length > 0 ? (
                    result.matched_keywords.map((word, i) => (
                      <span key={i} style={styles.matchTag}>
                        {word}
                      </span>
                    ))
                  ) : (
                    <span style={styles.emptyTag}>None</span>
                  )}
                </div>

                <p>
                  <strong>❌ Missing Keywords:</strong>
                </p>
                <div style={styles.keywordBox}>
                  {(result.unmatched_keywords || []).length > 0 ? (
                    result.unmatched_keywords.map((word, i) => (
                      <span key={i} style={styles.missTag}>
                        {word}
                      </span>
                    ))
                  ) : (
                    <span style={styles.emptyTag}>None</span>
                  )}
                </div>

                <button
                  style={styles.enhanceBtn}
                  onClick={() =>
                    goToEnhance(
                      result.fileName,
                      result.unmatched_keywords || [],
                      result.resume_text
                    )
                  }
                  type="button"
                >
                  🚀 Enhance My Resume
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && !comparisonResult && <p>Upload resumes and job description, then click Compare.</p>}
      </main>
    </div>
  );
};

function ParsedInsights({ parsed }) {
  const { name, email, phone, skills, education, experience } = parsed || {};
  return (
    <div style={insights}>
      <h4 style={{ margin: "0 0 8px 0" }}>Parsed Insights</h4>
      <div style={{ marginTop: 2 }}>
        <b>Name:</b> {name || "—"}
      </div>
      <div style={{ marginTop: 2 }}>
        <b>Email:</b> {email || "—"}
      </div>
      <div style={{ marginTop: 2 }}>
        <b>Phone:</b> {phone || "—"}
      </div>

      <div style={{ marginTop: 6 }}>
        <b>Skills:</b> {(skills || []).slice(0, 20).join(", ") || "—"}
      </div>

      {!!education?.length && (
        <div style={{ marginTop: 8 }}>
          <b>Education:</b>
          <ul style={ul}>
            {education.slice(0, 3).map((e, i) => (
              <li key={i}>
                {[e.degree, e.school, e.location, e.start && `(${e.start}–${e.end || "present"})`]
                  .filter(Boolean)
                  .join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!experience?.length && (
        <div style={{ marginTop: 8 }}>
          <b>Experience:</b>
          <ul style={ul}>
            {experience.slice(0, 3).map((x, i) => (
              <li key={i}>
                {[x.title, x.company, x.location, x.start && `(${x.start}–${x.end || "present"})`]
                  .filter(Boolean)
                  .join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "Segoe UI, sans-serif",
    background: "linear-gradient(90deg, #e3f2fd, #ffffff)",
  },
  sidebar: {
    width: "360px",
    background: "#f9fbfd",
    borderRight: "1px solid #d6dee8",
    padding: "24px",
    boxShadow: "2px 0 8px rgba(0,0,0,0.05)",
  },
  content: { flex: 1, padding: "40px" },
  header: {
    fontSize: "1.5rem",
    marginBottom: "20px",
    fontWeight: "600",
    color: "#1f3b4d",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "20px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "600",
    color: "#333",
  },
  selectBox: {
    width: "100%",
    padding: "8px",
    fontSize: "0.95rem",
    borderRadius: "8px",
    border: "1px solid #ccc",
  },
  filePreview: { marginTop: "10px" },
  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#edf6ff",
    padding: "8px 12px",
    borderRadius: "6px",
    marginBottom: "8px",
    fontSize: "0.9rem",
  },
  fileIcon: { fontSize: "1.2rem" },
  xBtn: {
    marginLeft: "auto",
    background: "transparent",
    border: "none",
    color: "#d62828",
    cursor: "pointer",
    fontSize: "1rem",
  },
  textarea: {
    width: "100%",
    padding: "10px",
    fontSize: "0.95rem",
    borderRadius: "8px",
    border: "1px solid #ccc",
    resize: "vertical",
  },
  actions: { display: "flex", justifyContent: "space-between", gap: "10px" },
  compareBtn: {
    flex: 1,
    padding: "12px",
    backgroundColor: "#1f3b4d",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
  },
  clearBtn: {
    flex: 1,
    padding: "12px",
    backgroundColor: "#e0e0e0",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
  },
  resultCard: {
    marginBottom: "30px",
    background: "#ffffff",
    padding: "20px",
    borderRadius: "10px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
  },
  keywordBox: { display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "10px" },
  matchTag: {
    background: "#d1fae5",
    color: "#065f46",
    padding: "6px 12px",
    borderRadius: "16px",
    fontSize: "0.85rem",
  },
  missTag: {
    background: "#ffe4e6",
    color: "#9f1239",
    padding: "6px 12px",
    borderRadius: "16px",
    fontSize: "0.85rem",
  },
  emptyTag: { color: "#999", fontStyle: "italic" },
  enhanceBtn: {
    marginTop: "12px",
    padding: "10px 16px",
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 600,
  },
};

const insights = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
};
const ul = { margin: "6px 0 0 16px" };

export default ResumeMatcherPage;
