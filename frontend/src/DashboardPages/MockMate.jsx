import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * MockMate – Voice Interview (no Chakra UI)
 * - Assistant asks questions via Text-to-Speech (TTS)
 * - User answers by voice via SpeechRecognition (STT)
 * - Live transcription (interim + final)
 * - Optional feedback via existing /api/v1/feedback (no new API)
 * - Text chat fallback using your old /api/interview-assistant
 */

const API_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE_URL) ||
  "";

const hasTTS = typeof window !== "undefined" && "speechSynthesis" in window;
const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Simple default questions for v1 (can swap to /api/v1/generate later)
const DEFAULT_QUESTIONS = [
  "Tell me about yourself.",
  "Why are you interested in this role?",
  "Describe a challenging problem you solved recently.",
  "How do you prioritize tasks under a tight deadline?",
  "Tell me about a time you worked in a team and resolved a conflict.",
];

/* ---------------------- NEW: ensure voices are ready ---------------------- */
function getVoicesReady() {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    if (voices && voices.length) return resolve(voices);
    const id = setInterval(() => {
      const v = synth.getVoices();
      if (v && v.length) {
        clearInterval(id);
        resolve(v);
      }
    }, 50);
  });
}

export default function MockMate() {
  // ----- Text chat (fallback) -----
  const [userInput, setUserInput] = useState("");
  const [conversation, setConversation] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);

  // ----- Voice interview state -----
  const [running, setRunning] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);

  const [questions, setQuestions] = useState(DEFAULT_QUESTIONS);
  const [qIndex, setQIndex] = useState(0);
  const currentQuestion = questions[qIndex] || "No more questions.";
  const progressText = `Question ${Math.min(qIndex + 1, questions.length)} of ${questions.length}`;

  // transcripts
  const [assistantLines, setAssistantLines] = useState([]); // {text, ts}
  const [userLines, setUserLines] = useState([]);           // {text, ts, q}
  const [userInterim, setUserInterim] = useState("");

  // feedback
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [lastScore, setLastScore] = useState(null);
  const [lastFeedback, setLastFeedback] = useState(null);

  // refs
  const recRef = useRef(null);
  const cancelSpeakRef = useRef(null);

  // ---------- helpers ----------
  const addAssistantLine = useCallback((text) => {
    setAssistantLines((prev) => [...prev, { text, ts: Date.now() }]);
  }, []);

  const addUserFinal = useCallback((text) => {
    const t = String(text || "").trim();
    if (!t) return;
    setUserLines((prev) => [...prev, { text: t, ts: Date.now(), q: currentQuestion }]);
  }, [currentQuestion]);

  // ---------- TTS (updated) ----------
  const speak = useCallback(async (text) => {
    if (!hasTTS) return () => {};
    // cancel anything pending
    window.speechSynthesis.cancel();

    // wait for voices so first utterance isn't swallowed
    const voices = await getVoicesReady();
    const voice =
      voices.find(v => (v.lang || "").toLowerCase().startsWith("en")) ||
      voices[0];

    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.volume = 1.0; // ensure not muted
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(u);

    const cancel = () => {
      try { window.speechSynthesis.cancel(); } catch {}
    };
    cancelSpeakRef.current = cancel;
    return cancel;
  }, []);

  // ---------- STT ----------
  const startRecognition = useCallback(() => {
    if (!SR) return;
    stopRecognition();

    const rec = new SR();
    rec.interimResults = true;
    rec.continuous = true;
    rec.lang = "en-US";

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    rec.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0]?.transcript || "";
        if (res.isFinal) finalChunk += txt;
        else interim += txt;
      }
      if (interim) setUserInterim(interim);
      else setUserInterim("");
      if (finalChunk.trim()) addUserFinal(finalChunk);
    };

    try {
      rec.start();
      recRef.current = rec;
    } catch {
      setListening(false);
    }
  }, [addUserFinal]);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      rec.stop();
    } catch {}
    recRef.current = null;
    setListening(false);
    setUserInterim("");
  }, []);

  // ---------- flow ----------
  const askCurrent = useCallback(() => {
    if (!currentQuestion) return;
    stopRecognition();                // avoid echo
    addAssistantLine(currentQuestion);
    // no need to await; speaking starts immediately, mic resumes after onend
    speak(currentQuestion);
  }, [currentQuestion, speak, addAssistantLine, stopRecognition]);

  const handleStart = useCallback(async () => {
    if (!hasTTS || !SR) {
      alert("Your browser lacks full speech features. Voice mode may not work—use text chat below.");
      return;
    }
    // warm up voices so first utterance isn't swallowed
    try { await getVoicesReady(); } catch {}

    setRunning(true);
    setAssistantLines([]);
    setUserLines([]);
    setUserInterim("");
    setLastScore(null);
    setLastFeedback(null);
    setQIndex(0);
    askCurrent();
  }, [askCurrent]);

  const handleStop = useCallback(() => {
    setRunning(false);
    stopRecognition();
    window.speechSynthesis?.cancel();
    cancelSpeakRef.current?.();
  }, [stopRecognition]);

  const handleNext = useCallback(() => {
    const next = Math.min(qIndex + 1, questions.length - 1);
    setQIndex(next);
    setLastScore(null);
    setLastFeedback(null);
  }, [qIndex, questions.length]);

  // After TTS finishes, start mic if running
  useEffect(() => {
    if (!running) return;
    if (!speaking) startRecognition();
    else stopRecognition();
  }, [speaking, running, startRecognition, stopRecognition]);

  // Speak when question index changes
  useEffect(() => {
    if (!running) return;
    askCurrent();
  }, [qIndex, running, askCurrent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecognition();
      window.speechSynthesis?.cancel();
    };
  }, [stopRecognition]);

  // ---------- feedback (reuse your /api/v1/feedback) ----------
  const requestFeedback = useCallback(async (question, answer) => {
    if (!API_URL) return; // silently skip if no backend URL
    try {
      setLoadingFeedback(true);
      const res = await fetch(`${API_URL}/api/v1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "interview",
          question,
          answer_transcript: answer,
          target_role: "General",
          rubric: { dimensions: ["Relevance", "Structure", "Impact", "Clarity"], return_score: true },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Feedback error");
      setLastScore(data?.score ?? null);
      setLastFeedback(data);
    } catch (e) {
      setLastScore(null);
      setLastFeedback(null);
      console.warn("Feedback failed:", e?.message || e);
    } finally {
      setLoadingFeedback(false);
    }
  }, []);

  // When a new final answer arrives, get feedback
  useEffect(() => {
    if (!running) return;
    if (userLines.length === 0) return;
    const last = userLines[userLines.length - 1];
    requestFeedback(last.q, last.text);
  }, [userLines, running, requestFeedback]);

  // ---------- old text chat handler (fallback / optional) ----------
  const handleSend = async () => {
    const msg = userInput.trim();
    if (!msg) return;
    setLoadingChat(true);
    try {
      const response = await fetch(`${API_URL}/api/interview-assistant`, {
        method: "POST",
        body: JSON.stringify({ message: msg }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail || "Network error");
      setConversation((prev) => [
        ...prev,
        { role: "user", text: msg },
        { role: "ai", text: data.reply || "No response from AI." },
      ]);
      setUserInput("");
    } catch (err) {
      console.error("MockMate text error:", err);
      alert("Failed to get response from MockMate.");
    } finally {
      setLoadingChat(false);
    }
  };

  const supportMsg = useMemo(() => {
    if (hasTTS && SR) return "";
    if (!hasTTS && !SR) return "Speech Synthesis and Recognition are not supported in this browser.";
    if (!hasTTS) return "Speech Synthesis is not supported in this browser.";
    if (!SR) return "Speech Recognition is not supported (try Chrome/Edge).";
    return "";
  }, []);

  return (
    <div style={sx.page}>
      {/* Header */}
      <h1 style={sx.h1}>🤖 MockMate</h1>
      <p style={sx.sub}>Voice Interview Simulation — the assistant asks out loud, you answer by speaking. Live transcript included.</p>

      {/* Robot */}
      <div style={{ textAlign: "center", marginBottom: 12 }} aria-label="MockMate Robot" role="img">
        <img
          src="https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif"
          alt="MockMate Robot"
          style={{ width: 140, height: 140, objectFit: "cover" }}
        />
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          {running ? "Listening after each question…" : "(Ready when you are)"}
        </div>
      </div>

      {/* Status badges */}
      <div style={sx.badgesRow}>
        <Badge tone={running ? "green" : "gray"}>Session: {running ? "Running" : "Stopped"}</Badge>
        <Badge tone={speaking ? "blue" : "gray"}>Assistant: {speaking ? "Speaking" : "Idle"}</Badge>
        <Badge tone={listening ? "yellow" : "gray"}>Mic: {listening ? "Listening" : "Off"}</Badge>
        {!!supportMsg && <Badge tone="red">{supportMsg}</Badge>}
      </div>

      {/* Controls */}
      <div style={sx.controls}>
        {!running ? (
          <button style={sx.btnPrimary} onClick={handleStart} disabled={!hasTTS || !SR}>
            ▶ Start
          </button>
        ) : (
          <button style={sx.btnDanger} onClick={handleStop}>
            ■ Stop
          </button>
        )}
        <button
          style={sx.btn}
          onClick={handleNext}
          disabled={!running || qIndex >= questions.length - 1}
          title="Next question"
        >
          ⏭ Next
        </button>
        {/* Optional: quick voice test button */}
        <button style={sx.btn} onClick={() => speak("Testing one two three")}>
          Test Voice
        </button>
        <div style={{ color: "#6b7280" }}>{progressText}</div>
      </div>

      {/* Current Question */}
      <section style={sx.card}>
        <div style={sx.cardTitle}>Current Question</div>
        <div style={{ fontSize: 18 }}>{currentQuestion}</div>
      </section>

      {/* Transcripts */}
      <div style={sx.cols}>
        <section style={sx.cardCol}>
          <div style={sx.cardTitle}>Assistant (spoken)</div>
          <div style={sx.scroller}>
            {assistantLines.length === 0 ? (
              <div style={sx.muted}>No questions spoken yet.</div>
            ) : (
              assistantLines.map((l, i) => <Bubble key={l.ts + ":" + i} who="assistant" text={l.text} />)
            )}
          </div>
        </section>

        <section style={sx.cardCol}>
          <div style={sx.cardTitle}>You (live transcript)</div>
          <div style={sx.scroller}>
            {!!userInterim && <Bubble who="you" text={userInterim} interim />}
            {userLines.length === 0 && !userInterim && <div style={sx.muted}>Your spoken answers will appear here.</div>}
            {userLines.map((l, i) => <Bubble key={l.ts + ":" + i} who="you" text={l.text} />)}
          </div>
        </section>
      </div>

      {/* Feedback */}
      <section style={sx.card}>
        <div style={sx.cardHeader}>
          <div style={sx.cardTitle}>AI Feedback (per answer)</div>
          {loadingFeedback && <span style={sx.spinner}>⏳</span>}
        </div>
        {!lastFeedback ? (
          <div style={sx.muted}>Answer a question to see feedback here.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 24, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Score</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {typeof lastScore === "number" ? lastScore.toFixed(1) : "-"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Relevance • Structure • Impact • Clarity</div>
              </div>
            </div>
            <hr style={sx.hr} />
            {Array.isArray(lastFeedback?.strengths) && lastFeedback.strengths.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={sx.sectionHeader}>Strengths</div>
                {lastFeedback.strengths.map((s, i) => (
                  <div key={i} style={{ color: "#065f46" }}>• {s}</div>
                ))}
              </div>
            )}
            {Array.isArray(lastFeedback?.gaps) && lastFeedback.gaps.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={sx.sectionHeader}>Areas to Improve</div>
                {lastFeedback.gaps.map((g, i) => (
                  <div key={i} style={{ color: "#7f1d1d" }}>• {g}</div>
                ))}
              </div>
            )}
            {!!lastFeedback?.sample_answer && (
              <div>
                <div style={sx.sectionHeader}>Sample Answer</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{lastFeedback.sample_answer}</div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Text chat fallback */}
      <section style={{ marginTop: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Text Chat (fallback)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {conversation.map((m, i) => (
            <div
              key={i}
              style={{
                background: m.role === "user" ? "#eff6ff" : "#f3f4f6",
                border: "1px solid #e5e7eb",
                padding: 10,
                borderRadius: 10,
              }}
            >
              <strong>{m.role === "user" ? "You" : "MockMate"}:</strong> {m.text}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Type here if voice isn’t available…"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={loadingChat}
              style={sx.input}
              aria-label="Chat input"
            />
            <button onClick={handleSend} disabled={loadingChat || !userInput.trim()} style={sx.btn}>
              {loadingChat ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------ small UI helpers (no external CSS) ------------ */
function Badge({ children, tone = "gray" }) {
  const colors = {
    gray: { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" },
    green: { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
    blue: { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },
    yellow: { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" },
    red: { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
  }[tone] || {};
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 999,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
    >
      {children}
    </span>
  );
}

function Bubble({ who = "assistant", text = "", interim = false }) {
  const isYou = who === "you";
  return (
    <div
      title={interim ? "Interim (live)" : ""}
      style={{
        border: `1px solid ${isYou ? "#e9d5ff" : "#e5e7eb"}`,
        background: isYou ? (interim ? "#f5f3ff" : "#faf5ff") : "#f9fafb",
        padding: 10,
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
        {isYou ? "You" : "Assistant"} {interim ? "(live…)" : ""}
      </div>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
    </div>
  );
}

const sx = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: 16,
    background: "#f9fafb",
    minHeight: "100vh",
  },
  h1: { fontSize: 28, fontWeight: 800, margin: "4px 0" },
  sub: { color: "#4b5563", marginBottom: 12 },
  badgesRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  controls: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" },
  btn: {
    padding: "10px 14px",
    border: "1px solid #e5e7eb",
    background: "white",
    borderRadius: 10,
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "10px 14px",
    border: "1px solid #7c3aed",
    background: "#7c3aed",
    color: "white",
    borderRadius: 10,
    cursor: "pointer",
  },
  btnDanger: {
    padding: "10px 14px",
    border: "1px solid #dc2626",
    background: "#dc2626",
    color: "white",
    borderRadius: 10,
    cursor: "pointer",
  },
  card: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    boxShadow: "0 6px 16px rgba(15,23,42,.06)",
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontWeight: 600, marginBottom: 6 },
  cols: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  cardCol: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    minHeight: 240,
    boxShadow: "0 6px 16px rgba(15,23,42,.06)",
  },
  scroller: { display: "flex", flexDirection: "column", gap: 8, maxHeight: "45vh", overflowY: "auto" },
  muted: { color: "#6b7280" },
  hr: { border: 0, borderTop: "1px solid #e5e7eb", margin: "12px 0" },
  sectionHeader: { fontWeight: 600, margin: "6px 0" },
  input: {
    flex: 1,
    padding: "10px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    outline: "none",
    background: "white",
  },
  spinner: { fontSize: 14 },
};
