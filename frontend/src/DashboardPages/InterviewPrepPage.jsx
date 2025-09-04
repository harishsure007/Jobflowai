import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

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

  // 2) PDF (use local worker to avoid CDN/CORS/version issues)
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
    const ver = String(pdfjsLib.version || "5.0.0");
    const major = parseInt(ver.split(".")[0], 10) || 5;
    const workerPath = major >= 5 ? "/pdf.worker.min.mjs" : "/pdf.worker.min.js";
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

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
    type.includes("officedocument.wordprocessingml.document") || name.endsWith(".docx");
  if (isDocx) {
    const mod = await import("mammoth/mammoth.browser.js");
    const mammoth = mod.default || mod;
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return (result?.value || "").trim();
  }

  if (type === "application/msword" || name.endsWith(".doc")) {
    throw new Error("Please save .doc as .docx and retry.");
  }

  throw new Error("Unsupported file type. Please upload .txt, .pdf, or .docx.");
}

export default function InterviewPrepPage() {
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");

  // 🔤 Role is a manual text input
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

  // STAR scaffold state
  const [star, setStar] = useState({ s: "", t: "", a: "", r: "" });

  // word count + speaking time meter
  const wordCount = useMemo(() => (answer.trim() ? answer.trim().split(/\s+/).length : 0), [answer]);
  const speakMinutes = useMemo(() => (wordCount ? (wordCount / 130).toFixed(1) : "0.0"), [wordCount]); // ~130 wpm

  // Follow-ups & Keywords state
  const [followups, setFollowups] = useState([]);
  theLoadingFix();
  const [loadingFollowups, setLoadingFollowups] = useState(false);

  const [keywords, setKeywords] = useState({ matched: [], missing: [], extras: [] });
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function theLoadingFix() {} // no-op; avoids accidental dangling expressions in edits

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
    setFollowups([]);

    setLoadingQs(true);
    try {
      const { data } = await axios.post(`${API_BASE}/generate-questions`, {
        role: role || "Candidate",
        experience: "2 years",
        focus: questionType, // "technical" | "behavioral" | "system design"
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

  // ---- Auto-draft Answer ----
  const handleGenerate = async () => {
    const q = activeQuestion?.trim();
    if (!q) {
      setErrorMsg("Please enter or select an interview question.");
      return;
    }
    setErrorMsg("");
    setFeedback(null);
    setSavedId(null);
    setFollowups([]);

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

  // Build STAR into Answer
  const buildSTAR = () => {
    const parts = [
      star.s && `Situation: ${star.s}`,
      star.t && `Task: ${star.t}`,
      star.a && `Action: ${star.a}`,
      star.r && `Result: ${star.r}`,
    ].filter(Boolean);
    if (!parts.length) return;
    const txt = parts.join("\n");
    setAnswer((a) => (a ? a + "\n\n" + txt : txt));
  };

  // Export to DOCX (current question, answer, feedback)
  const exportDocx = async () => {
    const q = activeQuestion?.trim() || "(No question)";
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: "Interview Practice", heading: HeadingLevel.TITLE }),
            new Paragraph({
              children: [
                new TextRun({ text: "Role: ", bold: true }), new TextRun(role || "Candidate"),
                new TextRun({ text: "   •   " }),
                new TextRun({ text: "Type: ", bold: true }), new TextRun(questionType),
                new TextRun({ text: "   •   " }),
                new TextRun({ text: "Date: ", bold: true }), new TextRun(new Date().toLocaleString()),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Question", heading: HeadingLevel.HEADING_2 }),
            new Paragraph(q),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Answer", heading: HeadingLevel.HEADING_2 }),
            ...splitToParagraphs(answer || "(No answer yet)"),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Feedback", heading: HeadingLevel.HEADING_2 }),
            ...splitToParagraphs(formatFeedbackForExport(feedback)),
          ],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Interview_${(role || "Candidate").replace(/\s+/g, "_")}.docx`);
  };

  // === Analyze Keywords (calls /enhance/keywords) ===
  const analyzeKeywords = async () => {
    if (!jdText.trim()) {
      setErrorMsg("Please paste/upload a Job Description first.");
      return;
    }
    if (!resumeText.trim()) {
      setErrorMsg("Please paste/upload your Resume first.");
      return;
    }

    setErrorMsg("");
    setAnalyzing(true);
    try {
      const url = `${API_BASE}/enhance/keywords`;
      const { data } = await axios.post(url, {
        resume_text: resumeText,
        jd_text: jdText,
      });
      setKeywords({
        matched: Array.isArray(data?.matched) ? data.matched : [],
        missing: Array.isArray(data?.missing) ? data.missing : [],
        extras: Array.isArray(data?.extras) ? data.extras : [],
      });
    } catch (e) {
      setKeywords({ matched: [], missing: [], extras: [] });
      setErrorMsg(e?.response?.data?.detail || e?.message || "Keyword analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate Follow-up Questions
  const generateFollowups = async () => {
    const q = (activeQuestion || question || "").trim();
    if (!q) {
      setErrorMsg("Please enter or select a question first.");
      return;
    }
    if (!answer.trim()) {
      setErrorMsg("Please provide an answer first (or Auto-Draft).");
      return;
    }

    setErrorMsg("");
    setLoadingFollowups(true);
    try {
      const { data } = await axios.post(`${API_BASE}/generate-followups`, {
        question: q,
        answer,
        role: role || "Candidate",
        type: questionType,
      });
      setFollowups(Array.isArray(data?.followups) ? data.followups : []);
    } catch (e) {
      setFollowups([]);
      setErrorMsg(e?.response?.data?.detail || e?.message || "Failed to generate follow-ups.");
    } finally {
      setLoadingFollowups(false);
    }
  };

  // insert missing keywords into Answer
  const insertMissingIntoAnswer = () => {
    if (!keywords?.missing?.length) return;
    const txt = "\n\nMissing skills to highlight: " + keywords.missing.map((k) => `#${k}`).join(", ");
    setAnswer((a) => (a ? a + txt : txt.trim()));
  };

  return (
    <div style={styles.page}>
      {/* Left sidebar */}
      <aside style={styles.leftPane}>
        <div style={styles.sidebarSection}>
          <div style={styles.sidebarTitle}>📄 Resume</div>
          <input
            type="file"
            accept=".txt,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleResumeUpload}
          />
          <div style={styles.help}>Supported: TXT, PDF, DOCX</div>
          <textarea
            placeholder="Paste or upload resume..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            style={styles.longTextarea}
          />
        </div>

        <div style={{ height: 16 }} />

        <div style={styles.sidebarSection}>
          <div style={styles.sidebarTitle}>📌 Job Description</div>
          <input
            type="file"
            accept=".txt,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleJDUpload}
          />
          <div style={styles.help}>Supported: TXT, PDF, DOCX</div>
          <textarea
            placeholder="Paste or upload job description..."
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            style={styles.longTextarea}
          />
        </div>
      </aside>

      {/* Right main */}
      <main style={styles.rightPane}>
        <div style={styles.pageHeader}>
          <h2 style={styles.header}>🧠 Interview Prep</h2>
        </div>

        {errorMsg && <div style={styles.errorBox}>{errorMsg}</div>}

        {/* Card: Role & Question Type */}
        <section style={styles.card}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Role (type manually):</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Data Analyst"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Question Type:</label>
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
        </section>

        {/* Card: Question input */}
        <section style={styles.card}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Interview Question (or pick from list):</label>
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
              <button onClick={generateQuestions} style={styles.btnPrimary} disabled={loadingQs}>
                {loadingQs ? "Generating…" : "✨ Generate Questions"}
              </button>
            </div>
            <div style={styles.smallHelp}>Type your own question or click “Generate Questions”.</div>
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
                      setStar({ s: "", t: "", a: "", r: "" }); // reset STAR
                      setFollowups([]);
                    }}
                    style={{
                      padding: "10px 12px",
                      marginBottom: 8,
                      borderRadius: 10,
                      border: activeIdx === i ? "2px solid #2563eb" : "1px solid #e5e7eb",
                      background: activeIdx === i ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                    }}
                    title="Use this question"
                  >
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Q{i + 1}</div>
                    <div style={{ fontWeight: 600 }}>{q}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Card: Actions */}
        <section style={styles.card}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={handleGenerate} style={styles.btnPrimary} disabled={loadingDraft}>
              {loadingDraft ? "🚀 Drafting…" : "🚀 Auto-Draft Answer"}
            </button>

            <button
              onClick={getFeedback}
              style={styles.btnSuccess}
              disabled={loadingFeedback || (!activeQuestion && !question)}
            >
              {loadingFeedback ? "Scoring…" : "✅ Get Feedback & Save"}
            </button>

            <button
              onClick={generateFollowups}
              style={styles.btnInfo}
              disabled={loadingFollowups || !answer.trim()}
            >
              {loadingFollowups ? "…" : "🔁 Generate Follow-ups"}
            </button>

            <button onClick={analyzeKeywords} style={styles.btnNeutral} disabled={analyzing}>
              {analyzing ? "Analyzing…" : "🔎 Analyze Keywords"}
            </button>

            <button onClick={exportDocx} style={styles.btnNeutral}>
              📄 Export DOCX
            </button>

            <button onClick={buildSTAR} style={styles.btnWarning}>
              ⏩ Insert STAR Answer
            </button>
          </div>
        </section>

        {/* Card: STAR scaffold */}
        <section style={styles.card}>
          <div style={{ ...styles.formGroup, marginTop: 6 }}>
            <label style={{ ...styles.label, fontWeight: 700 }}>STAR Scaffold</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input
                style={styles.input}
                placeholder="Situation"
                value={star.s}
                onChange={(e) => setStar((st) => ({ ...st, s: e.target.value }))}
              />
              <input
                style={styles.input}
                placeholder="Task"
                value={star.t}
                onChange={(e) => setStar((st) => ({ ...st, t: e.target.value }))}
              />
              <input
                style={styles.input}
                placeholder="Action"
                value={star.a}
                onChange={(e) => setStar((st) => ({ ...st, a: e.target.value }))}
              />
              <input
                style={styles.input}
                placeholder="Result"
                value={star.r}
                onChange={(e) => setStar((st) => ({ ...st, r: e.target.value }))}
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
              <button style={styles.btnGhost} onClick={buildSTAR}>
                ⇢ Insert into Answer
              </button>
              <div style={styles.smallHelp}>Tip: Use short bullet phrases—then refine in the Answer box.</div>
            </div>
          </div>
        </section>

        {/* Card: Your Answer */}
        <section style={styles.card}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Your Answer:</label>
            <textarea
              rows={8}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here (or click Auto-Draft above)"
              style={styles.textarea}
            />
            <div style={styles.meter}>{wordCount} words • ~{speakMinutes} min spoken</div>
          </div>

          {/* Keyword chips */}
          {(keywords.matched.length || keywords.missing.length || keywords.extras.length) && (
            <div style={{ ...styles.formGroup, marginTop: 6 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <ChipGroup title="Matched" color="#10b981" icon="✅" items={keywords.matched} />
                <ChipGroup title="Missing" color="#ef4444" icon="⚠️" items={keywords.missing} />
                <ChipGroup title="Extras" color="#6366f1" icon="➕" items={keywords.extras} />
              </div>
              {keywords.missing.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button style={styles.btnDark} onClick={insertMissingIntoAnswer}>
                    ➕ Insert Missing Skills into Answer
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Card: Feedback */}
        {feedback && (
          <section style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ margin: 0 }}>Feedback</h4>
              <ScoreBadge score={feedback.score} />
            </div>

            {Array.isArray(feedback.strengths) && feedback.strengths.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Strengths</div>
                <ul>{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}

            {Array.isArray(feedback.improvements) && feedback.improvements.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Improvements</div>
                <ul>{feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}

            {feedback.improved_answer && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Improved Answer</div>
                <p style={{ whiteSpace: "pre-wrap" }}>{feedback.improved_answer}</p>
                <button
                  style={{ ...styles.btnDark, marginTop: 8 }}
                  onClick={() => setAnswer(feedback.improved_answer)}
                >
                  Use Improved Answer
                </button>
              </div>
            )}

            {/* Follow-ups list */}
            {followups.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Follow-up Questions</div>
                <div>
                  {followups.map((fq, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setQuestions((prev) => [fq, ...prev]);
                        setActiveIdx(null);
                        setQuestion(fq);
                        setAnswer("");
                        setFeedback(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      style={styles.followupItem}
                      title="Click to make this your next question"
                    >
                      {fq}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Card: Saved Feedback */}
        <section style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>💾 Saved Feedback (DB)</h3>
            <button onClick={loadSaved} style={styles.btnGhost} disabled={savedLoading}>
              {savedLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {savedErr && <div style={styles.errorBox}>{savedErr}</div>}

          {savedLoading ? (
            <p style={{ color: "#6b7280" }}>Loading…</p>
          ) : savedList.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No saved feedback yet.</p>
          ) : (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, marginTop: 10, overflow: "hidden" }}>
              {savedList.map((row) => {
                const isOpen = openRowId === row.id;
                const isHighlight = savedId && savedId === row.id;
                return (
                  <div
                    key={row.id}
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      padding: 12,
                      background: isHighlight ? "#ecfdf5" : "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700 }}>#{row.id}</div>
                      <div style={{ color: "#6b7280" }}>
                        {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>Question</div>
                    <div title={row.question}>{truncate(row.question, 120)}</div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button onClick={() => setOpenRowId(isOpen ? null : row.id)} style={styles.btnGhost}>
                        {isOpen ? "Hide Details" : "View Details"}
                      </button>
                      <button
                        onClick={() => deleteSaved(row.id)}
                        style={styles.btnDanger}
                      >
                        Delete
                      </button>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700, marginTop: 6 }}>Answer</div>
                        <pre style={styles.pre}>{row.answer}</pre>
                        <div style={{ fontWeight: 700, marginTop: 6 }}>Feedback</div>
                        <pre style={styles.pre}>{row.feedback}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* ---------- small components ---------- */
function ChipGroup({ title, color, icon, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.map((x, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 999,
              border: `1px solid ${color}`,
              color,
              background: "#fff",
              fontSize: 12,
            }}
          >
            <span>{icon}</span>
            <span>{x}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoreBadge({ score }) {
  const n = typeof score === "number" ? score : 0;
  let bg = "#fee2e2", fg = "#991b1b"; // red
  if (n >= 7) { bg = "#dcfce7"; fg = "#166534"; }     // green
  else if (n >= 4) { bg = "#fef3c7"; fg = "#92400e"; } // amber
  return (
    <span style={{
      padding: "6px 10px",
      borderRadius: 999,
      background: bg,
      color: fg,
      fontWeight: 700,
      minWidth: 64,
      textAlign: "center",
      display: "inline-block"
    }}>
      {n}/10
    </span>
  );
}

/* ---------- helpers ---------- */
function truncate(s, n) {
  if (!s) return "";
  const str = String(s);
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function splitToParagraphs(text) {
  const lines = String(text || "").split(/\r?\n/);
  if (lines.length === 0) return [new Paragraph("")];
  return lines.map((l) => new Paragraph({ children: [new TextRun(l || "")] }));
}

function formatFeedbackForExport(fb) {
  if (!fb) return "(No feedback yet)";
  const parts = [];
  if (typeof fb.score === "number") parts.push(`Score: ${fb.score}/10`);
  if (Array.isArray(fb.strengths) && fb.strengths.length) {
    parts.push("Strengths:");
    fb.strengths.forEach((s) => parts.push(`  • ${s}`));
  }
  if (Array.isArray(fb.improvements) && fb.improvements.length) {
    parts.push("Improvements:");
    fb.improvements.forEach((s) => parts.push(`  • ${s}`));
  }
  if (fb.improved_answer) {
    parts.push("Improved Answer:");
    parts.push(fb.improved_answer);
  }
  return parts.join("\n");
}

/* ---------- styles (modern cards & slimmer left sidebar) ---------- */
const styles = {
  page: {
    display: "flex",
    padding: "20px",
    gap: "20px",
    backgroundColor: "#f4f6f8",
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif",
    minHeight: "100vh",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },

  /* LEFT */
  leftPane: {
    width: "20%",                        // slimmer
    backgroundColor: "#fafafa",
    padding: "16px",
    borderRadius: "14px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 2px 10px rgba(15,23,42,.05)",
    alignSelf: "flex-start",
    position: "sticky",
    top: 20,
  },
  sidebarSection: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 },
  sidebarTitle: { fontWeight: 700, marginBottom: 8 },

  /* RIGHT */
  rightPane: {
    width: "80%",                        // main content
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: "12px",
    alignSelf: "flex-start",
  },
  pageHeader: { marginBottom: 10 },
  header: { fontSize: "1.6rem", margin: 0, color: "#1f2937" },

  /* Cards */
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 2px 12px rgba(15,23,42,.06)",
  },

  /* Forms */
  formGroup: { marginBottom: 14 },
  label: { display: "block", fontSize: 14, color: "#374151", marginBottom: 6, fontWeight: 600 },
  select: { width: "100%", padding: "10px", fontSize: "1rem", borderRadius: "10px", border: "1px solid #d1d5db", background: "#fff" },
  input: {
    width: "100%", padding: "12px", fontSize: "1rem",
    borderRadius: "10px", border: "1px solid #d1d5db", outline: "none", background: "#f9fafb"
  },
  textarea: {
    width: "100%", marginTop: "8px", padding: "12px",
    border: "1px solid #d1d5db", borderRadius: "10px",
    resize: "vertical", fontSize: "1rem", minHeight: 160, outline: "none", background: "#f9fafb"
  },
  longTextarea: {
    width: "100%", marginTop: "8px", padding: "10px",
    border: "1px solid #d1d5db", borderRadius: "10px",
    resize: "vertical", fontSize: "0.95rem", minHeight: 200, outline: "none", background: "#f9fafb"
  },

  /* Segment control */
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

  inlineRow: { display: "flex", gap: 10, alignItems: "center" },
  smallHelp: { marginTop: 6, fontSize: 12, color: "#6b7280" },
  meter: { fontSize: 12, color: "#6b7280", marginTop: 6 },

  /* Buttons */
  btnBase: {
    padding: "12px 16px",
    fontSize: "0.95rem",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "12px 16px", fontSize: "0.95rem", borderRadius: 10, cursor: "pointer",
    backgroundColor: "#2563eb", color: "#fff", border: "1px solid #1d4ed8",
  },
  btnSuccess: {
    padding: "12px 16px", fontSize: "0.95rem", borderRadius: 10, cursor: "pointer",
    backgroundColor: "#16a34a", color: "#fff", border: "1px solid #15803d",
  },
  btnInfo: {
    padding: "12px 16px", fontSize: "0.95rem", borderRadius: 10, cursor: "pointer",
    backgroundColor: "#0ea5e9", color: "#fff", border: "1px solid #0284c7",
  },
  btnNeutral: {
    padding: "12px 16px", fontSize: "0.95rem", borderRadius: 10, cursor: "pointer",
    backgroundColor: "#f3f4f6", color: "#111827", border: "1px solid #e5e7eb",
  },
  btnWarning: {
    padding: "12px 16px", fontSize: "0.95rem", borderRadius: 10, cursor: "pointer",
    backgroundColor: "#f59e0b", color: "#fff", border: "1px solid #d97706",
  },
  btnDark: {
    padding: "10px 14px", fontSize: "0.9rem", borderRadius: 10, cursor: "pointer",
    background: "#111827", color: "#fff", border: "1px solid #0b1220",
  },
  btnGhost: {
    padding: "10px 14px", fontSize: "0.9rem", borderRadius: 10, cursor: "pointer",
    background: "#fff", color: "#111827", border: "1px solid #e5e7eb",
  },
  btnDanger: {
    padding: "10px 14px", fontSize: "0.9rem", borderRadius: 10, cursor: "pointer",
    background: "#ef4444", color: "#fff", border: "1px solid #dc2626",
  },

  questionsBox: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },

  followupItem: {
    padding: "10px 12px",
    marginBottom: 8,
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
  },

  /* Alerts etc */
  errorBox: {
    backgroundColor: "#fef2f2",
    color: "#991b1b",
    padding: "12px",
    borderRadius: "10px",
    marginBottom: "16px",
    border: "1px solid #fee2e2",
  },

  pre: {
    whiteSpace: "pre-wrap",
    margin: 0,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 10,
  },
  help: { fontSize: 12, color: "#6b7280", marginTop: 6 },
};
