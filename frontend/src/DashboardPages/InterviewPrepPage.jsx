import React, { useState } from "react";
import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

const InterviewPrepPage = () => {
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [role, setRole] = useState("Software Engineer");
  const [questionType, setQuestionType] = useState("behavioral");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Handle resume file upload - only text files supported here
  const handleResumeUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = () => setResumeText(reader.result);
    reader.onerror = () => {
      setErrorMsg("Failed to read resume file. Please upload a text file.");
    };

    // Only read as text here
    reader.readAsText(file);
  };

  // Handle job description file upload
  const handleJDUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = () => setJdText(reader.result);
    reader.onerror = () => {
      setErrorMsg("Failed to read job description file. Please upload a text file.");
    };

    reader.readAsText(file);
  };

  const handleGenerate = async () => {
    if (!question.trim()) {
      setErrorMsg("Please enter an interview question.");
      return;
    }
    setLoading(true);
    setAnswer("⏳ Generating answer...");
    setFeedbackSent(false);
    setErrorMsg("");

    try {
      const response = await axios.post(`${API_BASE_URL}/generate-answer`, {
        resume_text: resumeText,
        jd_text: jdText,
        role,
        question,
        question_type: questionType,
      });
      setAnswer(response.data.answer || "🤖 No answer returned.");
    } catch (error) {
      console.error("Error generating answer:", error);
      setAnswer("❌ Failed to generate answer.");
      setErrorMsg("Error: Could not generate answer. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const sendFeedback = async (feedback) => {
    try {
      await axios.post(`${API_BASE_URL}/feedback/`, {
        question,
        answer,
        feedback,
      });
      setFeedbackSent(true);
      setErrorMsg("");
    } catch (error) {
      console.error("Error sending feedback:", error);
      setErrorMsg("Failed to send feedback. Please try again.");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.leftPane}>
        <h3>📄 Resume</h3>
        <input
          type="file"
          accept=".txt"
          onChange={handleResumeUpload}
          disabled={loading}
        />
        <textarea
          placeholder="Paste or upload resume..."
          rows={8}
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          style={styles.textarea}
          disabled={loading}
        />

        <h3>📌 Job Description</h3>
        <input
          type="file"
          accept=".txt"
          onChange={handleJDUpload}
          disabled={loading}
        />
        <textarea
          placeholder="Paste or upload job description..."
          rows={8}
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          style={styles.textarea}
          disabled={loading}
        />
      </div>

      <div style={styles.rightPane}>
        <h2 style={styles.header}>🧠 Interview Prep</h2>

        {errorMsg && (
          <div style={styles.errorBox}>
            {errorMsg}
          </div>
        )}

        <div style={styles.formGroup}>
          <label>Role:</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={styles.select}
            disabled={loading}
          >
            <option>Software Engineer</option>
            <option>Data Scientist</option>
            <option>Product Manager</option>
            <option>UX Designer</option>
          </select>
        </div>

        <div style={styles.formGroup}>
          <label>Question Type:</label>
          <div style={styles.toggleGroup}>
            <button
              type="button"
              style={questionType === "behavioral" ? styles.activeToggle : styles.toggle}
              onClick={() => setQuestionType("behavioral")}
              disabled={loading}
            >
              🧍 Behavioral
            </button>
            <button
              type="button"
              style={questionType === "technical" ? styles.activeToggle : styles.toggle}
              onClick={() => setQuestionType("technical")}
              disabled={loading}
            >
              💻 Technical
            </button>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label>Interview Question:</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. How do you handle conflict?"
            style={styles.input}
            disabled={loading}
          />
        </div>

        <button
          onClick={handleGenerate}
          style={styles.generateButton}
          disabled={loading || !question.trim()}
        >
          {loading ? "🚀 Generating..." : "🚀 Generate Answer"}
        </button>

        {answer && (
          <div style={styles.answerBox}>
            <h4>AI Response:</h4>
            <div dangerouslySetInnerHTML={{ __html: answer.replace(/\n/g, "<br/>") }} />

            {!feedbackSent && !loading && (
              <div style={styles.feedbackGroup}>
                <p style={{ marginTop: "20px" }}>Was this helpful?</p>
                <button
                  onClick={() => sendFeedback("👍 Helpful")}
                  style={styles.feedbackButton}
                  disabled={loading}
                >
                  👍 Helpful
                </button>
                <button
                  onClick={() => sendFeedback("👎 Needs improvement")}
                  style={styles.feedbackButton}
                  disabled={loading}
                >
                  👎 Needs improvement
                </button>
              </div>
            )}

            {feedbackSent && (
              <p style={{ color: "green", marginTop: "10px" }}>
                ✅ Feedback submitted. Thanks!
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  page: {
    display: "flex",
    padding: "40px",
    gap: "40px",
    backgroundColor: "#f4f6f8",
    fontFamily: "Segoe UI, sans-serif",
    minHeight: "100vh",
    alignItems: "flex-start",
  },
  leftPane: {
    width: "35%",
    backgroundColor: "#ffffff",
    padding: "20px",
    borderRadius: "10px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
  },
  rightPane: {
    width: "65%",
    backgroundColor: "#ffffff",
    padding: "30px",
    borderRadius: "10px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
  },
  header: {
    fontSize: "1.6rem",
    marginBottom: "20px",
  },
  formGroup: {
    marginBottom: "20px",
  },
  select: {
    width: "100%",
    padding: "10px",
    fontSize: "1rem",
    borderRadius: "6px",
    border: "1px solid #ccc",
  },
  toggleGroup: {
    display: "flex",
    gap: "10px",
    marginTop: "10px",
  },
  toggle: {
    flex: 1,
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    backgroundColor: "#f0f0f0",
    cursor: "pointer",
  },
  activeToggle: {
    flex: 1,
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #0078D4",
    backgroundColor: "#0078D4",
    color: "#fff",
    cursor: "pointer",
  },
  input: {
    width: "100%",
    padding: "10px",
    fontSize: "1rem",
    borderRadius: "6px",
    border: "1px solid #ccc",
  },
  textarea: {
    width: "100%",
    marginTop: "10px",
    padding: "10px",
    border: "1px solid #ccc",
    borderRadius: "6px",
    resize: "vertical",
    fontSize: "1rem",
  },
  generateButton: {
    padding: "12px 20px",
    fontSize: "1rem",
    backgroundColor: "#0078D4",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  answerBox: {
    marginTop: "30px",
    backgroundColor: "#f9f9f9",
    padding: "20px",
    borderRadius: "8px",
    border: "1px solid #ddd",
  },
  feedbackGroup: {
    marginTop: "20px",
    display: "flex",
    gap: "10px",
  },
  feedbackButton: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    backgroundColor: "#eee",
    cursor: "pointer",
  },
  errorBox: {
    backgroundColor: "#f8d7da",
    color: "#842029",
    padding: "12px",
    borderRadius: "6px",
    marginBottom: "20px",
    border: "1px solid #f5c2c7",
  },
};

export default InterviewPrepPage;
