import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";

/** ---- Robust API base (Vite or CRA), always ends up like http://host:port/api/v1 ---- */
const RAW =
  (typeof import.meta !== "undefined" && import.meta.env && (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) ||
  (typeof process !== "undefined" && process.env && (process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE)) ||
  "http://127.0.0.1:8000";
const API_BASE = String(RAW).replace(/\/+$/, "") + "/api/v1";

/* -------- file -> text extraction (txt, pdf, docx) -------- */
async function extractTextFromFile(file) {
  const name = (file?.name || "").toLowerCase();
  const type = file?.type || "";
  const buf = await file.arrayBuffer();

  // 1) TXT
  if (type.startsWith("text/") || name.endsWith(".txt")) {
    return new TextDecoder("utf-8").decode(buf);
  }

  // 2) PDF (via pdfjs-dist + CDN worker)
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const pdfjsLib = await import("pdfjs-dist");
    const ver = pdfjsLib.version || "4.6.82";
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/pdf.worker.min.js`;

    const loadingTask = pdfjsLib.getDocument({ data: buf });
    const pdf = await loadingTask.promise;

    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const strings = content.items
        .map((it) => ("str" in it ? it.str : ""))
        .filter(Boolean);
      fullText += strings.join(" ") + "\n";
    }
    return fullText.trim();
  }

  // 3) DOCX (via mammoth browser build)
  const isDocx =
    type.includes("officedocument.wordprocessingml.document") ||
    name.endsWith(".docx");
  if (isDocx) {
    const mod = await import("mammoth/mammoth.browser.js");
    const mammoth = mod.default || mod;
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return (result?.value || "").trim();
  }

  if (type === "application/msword" || name.endsWith(".doc")) {
    throw new Error("Old .doc files aren’t supported in browser. Please save as .docx and retry.");
  }

  throw new Error("Unsupported file type. Please upload .txt, .pdf, or .docx.");
}

export default function InterviewPrepPage() {
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");

  // 🔤 Role is now a manual text input
  const [role, setRole] = useState("");

  const [questionType, setQuestionType] = useState("behavioral");
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(null);

  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [savedId, setSavedId] = useState(null);

  // loaders
  const [loadingQs, setLoadingQs] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");

  // --- SAVED FEEDBACK (same page) ---
  const [savedList, setSavedList] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedErr, setSavedErr] = useState("");
  const [openRowId, setOpenRowId] = useState(null); // expand details

  const activeQuestion = useMemo(
    () => (activeIdx != null ? questions[activeIdx] : question),
    [activeIdx, questions, question]
  );

  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSaved() {
    setSavedLoading(true);
    setSavedErr("");
    try {
      const { data } = await axios.get(`${API_BASE}/feedback/`);
      setSavedList(Array.isArray(data) ? data : []);
    } catch (e) {
      setSavedErr(e?.response?.data?.detail || e?.message || "Failed to load saved feedback.");
    } finally {
      setSavedLoading(false);
    }
  }

  async function deleteSaved(id) {
    const yes = window.confirm("Delete this saved feedback?");
    if (!yes) return;
    try {
      await axios.delete(`${API_BASE}/feedback/${id}`);
      setSavedList((prev) => prev.filter((r) => r.id !== id));
      if (openRowId === id) setOpenRowId(null);
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "Failed to delete.");
    }
  }

  // ---- File uploads (txt, pdf, docx) ----
  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMsg("");
      const text = await extractTextFromFile(file);
      setResumeText(text);
    } catch (err) {
      setErrorMsg(err.message || "Failed to read resume file.");
    }
  };

  const handleJDUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMsg("");
      const text = await extractTextFromFile(file);
      setJdText(text);
    } catch (err) {
      setErrorMsg(err.message || "Failed to read job description file.");
    }
  };

  // ---- Generate Questions ----
  const generateQuestions = async () => {
    setErrorMsg("");
    setQuestions([]);
    setActiveIdx(null);
    setAnswer("");
    setFeedback(null);
    setSavedId(null);

    setLoadingQs(true);
    try {
      const { data } = await axios.post(`${API_BASE}/generate-questions`, {
        role: role || "Candidate",
        experience: "2 years",
        focus: questionType,    // "technical" | "behavioral" | "system design"
        count: 5,
      });
      const qs = Array.isArray(data?.questions) ? data.questions : [];
      setQuestions(qs);
      if (qs.length) setActiveIdx(0);
    } catch (err) {
      if (err?.response?.status === 404) {
        setErrorMsg("Generate Questions feature is not enabled on the backend.");
      } else {
        setErrorMsg(err?.response?.data?.detail || err?.message || "Failed to generate questions.");
      }
    } finally {
      setLoadingQs(false);
    }
  };

  // ---- Auto-draft Answer (optional) ----
  const handleGenerate = async () => {
    const q = activeQuestion?.trim();
    if (!q) {
      setErrorMsg("Please enter or select an interview question.");
      return;
    }
    setErrorMsg("");
    setFeedback(null);
    setSavedId(null);

    setLoadingDraft(true);
    try {
      const { data } = await axios.post(`${API_BASE}/generate-answer`, {
        resume_text: resumeText,
        jd_text: jdText,
        role: role || "Candidate",
        question: q,
        question_type: questionType,
      });
      setAnswer(data?.answer || "");
    } catch (error) {
      console.error("Error generating answer:", error);
      setErrorMsg(error?.response?.data?.detail || error?.message || "Could not generate answer.");
    } finally {
      setLoadingDraft(false);
    }
  };

  // ---- Get structured feedback (and save) ----
  const getFeedback = async () => {
    const q = activeQuestion?.trim();
    if (!q) {
      setErrorMsg("Please enter or select an interview question.");
      return;
    }
    if (!answer.trim()) {
      setErrorMsg("Please write or generate an answer first.");
      return;
    }
    setErrorMsg("");
    setFeedback(null);
    setSavedId(null);

    setLoadingFeedback(true);
    try {
      const { data } = await axios.post(`${API_BASE}/feedback/interview-answer`, {
        question: q,
        answer,
        style: "STAR",
        role: role || "Candidate",
        resume_text: resumeText || undefined,
        jd_text: jdText || undefined,
        save: true,
      });
      setFeedback(data);
      setSavedId(data?.saved_id || null);

      await loadSaved();
      if (data?.saved_id) setOpenRowId(data.saved_id);
    } catch (error) {
      console.error("Error getting feedback:", error);
      setErrorMsg(error?.response?.data?.detail || error?.message || "Failed to get feedback.");
    } finally {
      setLoadingFeedback(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Left column: Resume / JD */}
      <div style={styles.leftPane}>
        <h3 style={{ marginTop: 0 }}>📄 Resume</h3>
        <input
          type="file"
          accept=".txt,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleResumeUpload}
        />
        <div style={styles.help}>Supported: TXT, PDF, DOCX (old .DOC not supported in-browser)</div>
        <textarea
          placeholder="Paste or upload resume..."
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          style={styles.longTextarea}
        />

        <h3>📌 Job Description</h3>
        <input
          type="file"
          accept=".txt,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleJDUpload}
        />
        <div style={styles.help}>Supported: TXT, PDF, DOCX (old .DOC not supported in-browser)</div>
        <textarea
          placeholder="Paste or upload job description..."
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          style={styles.longTextarea}
        />
      </div>

      {/* Right column: Controls / Qs / Answer / Feedback */}
      <div style={styles.rightPane}>
        <h2 style={styles.header}>🧠 Interview Prep</h2>

        {errorMsg && <div style={styles.errorBox}>{errorMsg}</div>}

        {/* Role (manual) */}
        <div style={styles.formGroup}>
          <label>Role (type manually):</label>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Data Analyst"
            style={styles.input}
          />
        </div>

        {/* Question Type segmented control */}
        <div style={styles.formGroup}>
          <label>Question Type:</label>
          <div style={styles.segment}>
            <button
              type="button"
              onClick={() => setQuestionType("behavioral")}
              style={questionType === "behavioral" ? styles.segmentBtnActive : styles.segmentBtn}
            >
              🧍 Behavioral
            </button>
            <button
              type="button"
              onClick={() => setQuestionType("technical")}
              style={questionType === "technical" ? styles.segmentBtnActive : styles.segmentBtn}
            >
              💻 Technical
            </button>
            <button
              type="button"
              onClick={() => setQuestionType("system design")}
              style={questionType === "system design" ? styles.segmentBtnActive : styles.segmentBtn}
            >
              🧱 System Design
            </button>
          </div>
        </div>

        {/* Interview Question input + Generate Questions (moved here, side-by-side) */}
        <div style={styles.formGroup}>
          <label>Interview Question (or pick from list):</label>
          <div style={styles.inlineRow}>
            <input
              type="text"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setActiveIdx(null);
              }}
              placeholder="e.g. How do you handle conflict?"
              style={{ ...styles.input, flex: 1 }}
            />
            <button onClick={generateQuestions} style={styles.secondaryBtn} disabled={loadingQs}>
              {loadingQs ? "Generating…" : "✨ Generate Questions"}
            </button>
          </div>
          <div style={styles.smallHelp}>Tip: You can also type your own question above.</div>
        </div>

        {/* Questions List */}
        {questions.length > 0 && (
          <div style={styles.questionsBox}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Suggested Questions</div>
            <div>
              {questions.map((q, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setActiveIdx(i);
                    setQuestion("");
                    setFeedback(null);
                    setSavedId(null);
                    setAnswer("");
                  }}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 8,
                    borderRadius: 8,
                    border: activeIdx === i ? "2px solid #4f46e5" : "1px solid #e5e7eb",
                    background: activeIdx === i ? "#eef2ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Q{i + 1}</div>
                  <div style={{ fontWeight: 500 }}>{q}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <button onClick={handleGenerate} style={styles.generateButton} disabled={loadingDraft}>
            {loadingDraft ? "🚀 Drafting…" : "🚀 Auto-Draft Answer"}
          </button>
          <button
            onClick={getFeedback}
            style={{ ...styles.generateButton, backgroundColor: "#059669" }}
            disabled={loadingFeedback || (!activeQuestion && !question)}
          >
            {loadingFeedback ? "Scoring…" : "✅ Get Feedback & Save"}
          </button>
        </div>

        {/* Your Answer (editable) */}
        <div style={styles.formGroup}>
          <label>Your Answer:</label>
          <textarea
            rows={8}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here (or click Auto-Draft above)"
            style={styles.textarea}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") getFeedback();
            }}
          />
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            Tip: Press <b>Cmd/Ctrl + Enter</b> to Get Feedback.
          </div>
        </div>

        {/* Feedback card */}
        {feedback && (
          <div style={styles.feedbackCard}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h4 style={{ margin: 0 }}>Feedback</h4>
              <div style={{ fontWeight: 600 }}>Score: {feedback.score}/10</div>
            </div>

            {Array.isArray(feedback.strengths) && feedback.strengths.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600 }}>Strengths</div>
                <ul>
                  {feedback.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(feedback.improvements) && feedback.improvements.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600 }}>Improvements</div>
                <ul>
                  {feedback.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {feedback.improved_answer && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600 }}>Improved Answer</div>
                <p style={{ whiteSpace: "pre-wrap" }}>{feedback.improved_answer}</p>
                <button
                  style={{ ...styles.smallBtn, marginTop: 8 }}
                  onClick={() => setAnswer(feedback.improved_answer)}
                >
                  Use Improved Answer
                </button>
              </div>
            )}

            {savedId && (
              <p style={{ color: "green", marginTop: 10 }}>✅ Saved to DB (ID: {savedId})</p>
            )}
          </div>
        )}

        {/* ---------- Saved Feedback (same page) ---------- */}
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ margin: 0 }}>💾 Saved Feedback (DB)</h3>
            <button onClick={loadSaved} style={styles.ghostBtn} disabled={savedLoading}>
              {savedLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {savedErr && <div style={styles.errorBox}>{savedErr}</div>}

          {savedLoading ? (
            <p style={{ color: "#6b7280" }}>Loading…</p>
          ) : savedList.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No saved feedback yet.</p>
          ) : (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, marginTop: 10 }}>
              {savedList.map((row) => {
                const isOpen = openRowId === row.id;
                const isHighlight = savedId && savedId === row.id;
                return (
                  <div key={row.id} style={{ borderTop: "1px solid #f3f4f6", padding: 12, background: isHighlight ? "#ecfdf5" : "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 600 }}>#{row.id}</div>
                      <div style={{ color: "#6b7280" }}>{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</div>
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 600 }}>Question</div>
                    <div title={row.question}>{truncate(row.question, 120)}</div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => setOpenRowId(isOpen ? null : row.id)}
                        style={styles.smallBtn}
                      >
                        {isOpen ? "Hide Details" : "View Details"}
                      </button>
                      <button
                        onClick={() => deleteSaved(row.id)}
                        style={{ ...styles.smallBtn, background: "#ef4444" }}
                      >
                        Delete
                      </button>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 600, marginTop: 6 }}>Answer</div>
                        <pre style={styles.pre}>{row.answer}</pre>
                        <div style={{ fontWeight: 600, marginTop: 6 }}>Feedback</div>
                        <pre style={styles.pre}>{row.feedback}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function truncate(s, n) {
  if (!s) return "";
  const str = String(s);
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

/* ---------- styles ---------- */
const styles = {
  page: {
    display: "flex",
    padding: "40px",
    gap: "32px",
    backgroundColor: "#f4f6f8",
    fontFamily: "Segoe UI, sans-serif",
    minHeight: "100vh",
    alignItems: "flex-start",
    justifyContent: "flex-start", // push content to the left side
  },
  leftPane: {
    width: "38%", // slightly wider
    backgroundColor: "#ffffff",
    padding: "20px",
    borderRadius: "12px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
    alignSelf: "flex-start",
  },
  rightPane: {
    width: "62%",
    backgroundColor: "#ffffff",
    padding: "28px",
    borderRadius: "12px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
    alignSelf: "flex-start",
  },
  header: {
    fontSize: "1.6rem",
    marginBottom: "16px",
  },
  formGroup: {
    marginBottom: "18px",
  },
  select: {
    width: "100%",
    padding: "10px",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
  },
  input: {
    width: "100%",
    padding: "12px",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    outline: "none",
  },
  textarea: {
    width: "100%",
    marginTop: "10px",
    padding: "12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    resize: "vertical",
    fontSize: "1rem",
    minHeight: 160,
    outline: "none",
  },
  // Taller textareas specifically for Resume & JD
  longTextarea: {
    width: "100%",
    marginTop: "10px",
    padding: "12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    resize: "vertical",
    fontSize: "1rem",
    minHeight: 320, // increased height per your request
    outline: "none",
  },

  // Segmented control styles
  segment: {
    display: "inline-flex",
    gap: 0,
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    padding: 4,
  },
  segmentBtn: {
    padding: "10px 14px",
    fontSize: 14,
    background: "transparent",
    border: "none",
    borderRadius: 999,
    cursor: "pointer",
  },
  segmentBtnActive: {
    padding: "10px 14px",
    fontSize: 14,
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(79,70,229,.25)",
  },

  // Input + Generate Questions in one row
  inlineRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  smallHelp: {
    marginTop: 6,
    fontSize: 12,
    color: "#6b7280",
  },

  secondaryBtn: {
    padding: "12px 14px",
    fontSize: "0.95rem",
    backgroundColor: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  generateButton: {
    padding: "12px 18px",
    fontSize: "1rem",
    backgroundColor: "#0078D4",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  questionsBox: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  feedbackCard: {
    marginTop: "20px",
    backgroundColor: "#ecfdf5",
    padding: "16px",
    borderRadius: "10px",
    border: "1px solid #a7f3d0",
  },
  errorBox: {
    backgroundColor: "#f8d7da",
    color: "#842029",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "20px",
    border: "1px solid #f5c2c7",
  },
  ghostBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
  },
  smallBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "#0ea5e9",
    color: "#fff",
    cursor: "pointer",
  },
  pre: {
    whiteSpace: "pre-wrap",
    margin: 0,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 10,
  },
  help: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 6,
  },
};
