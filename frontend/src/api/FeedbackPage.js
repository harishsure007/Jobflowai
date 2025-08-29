import React, { useEffect, useState } from "react";
import {
  createFeedback,
  getAllFeedback,
  updateFeedback,
  deleteFeedback,
} from "./feedback";

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [form, setForm] = useState({ question: "", answer: "", feedback: "" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadFeedback();
  }, []);

  const loadFeedback = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllFeedback();
      setFeedbacks(res.data);
    } catch (err) {
      setError("Failed to load feedback. Please try again.");
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!form.question || !form.answer || !form.feedback) {
      setError("All fields are required.");
      setLoading(false);
      return;
    }

    try {
      if (editingId) {
        await updateFeedback(editingId, form);
        setEditingId(null);
      } else {
        await createFeedback(form);
      }
      setForm({ question: "", answer: "", feedback: "" });
      await loadFeedback();
    } catch (err) {
      setError("Failed to submit feedback. Please try again.");
    }
    setLoading(false);
  };

  const handleEdit = (fb) => {
    setForm({
      question: fb.question,
      answer: fb.answer,
      feedback: fb.feedback,
    });
    setEditingId(fb.id);
    setError(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this feedback?")) return;
    setLoading(true);
    setError(null);
    try {
      await deleteFeedback(id);
      await loadFeedback();
    } catch (err) {
      setError("Failed to delete feedback. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "auto", fontFamily: "Arial, sans-serif" }}>
      <h2>Feedback Manager</h2>

      {error && (
        <div style={{ color: "red", marginBottom: 10 }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <label>
          Question:
          <input
            style={inputStyle}
            placeholder="Question"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            disabled={loading}
          />
        </label>

        <label>
          Answer:
          <textarea
            style={textareaStyle}
            placeholder="Answer"
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            disabled={loading}
          />
        </label>

        <label>
          Feedback:
          <textarea
            style={textareaStyle}
            placeholder="Feedback"
            value={form.feedback}
            onChange={(e) => setForm({ ...form, feedback: e.target.value })}
            disabled={loading}
          />
        </label>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Please wait..." : editingId ? "Update" : "Submit"}
        </button>
      </form>

      <h3>All Feedback</h3>

      {loading && <p>Loading feedback...</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {feedbacks.map((fb) => (
          <li key={fb.id} style={listItemStyle}>
            <div><b>Q:</b> {fb.question}</div>
            <div><b>A:</b> {fb.answer}</div>
            <div><b>Feedback:</b> {fb.feedback}</div>
            <div style={{ marginTop: 5 }}>
              <button onClick={() => handleEdit(fb)} disabled={loading} style={smallButtonStyle}>
                Edit
              </button>
              <button onClick={() => handleDelete(fb.id)} disabled={loading} style={{ ...smallButtonStyle, marginLeft: 10, backgroundColor: "#e74c3c" }}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Styles
const inputStyle = {
  display: "block",
  width: "100%",
  padding: 8,
  margin: "8px 0 16px",
  borderRadius: 4,
  border: "1px solid #ccc",
  fontSize: 16,
};

const textareaStyle = {
  ...inputStyle,
  height: 80,
  resize: "vertical",
};

const buttonStyle = {
  padding: "10px 20px",
  fontSize: 16,
  borderRadius: 4,
  border: "none",
  backgroundColor: "#007bff",
  color: "white",
  cursor: "pointer",
};

const smallButtonStyle = {
  padding: "5px 12px",
  fontSize: 14,
  borderRadius: 4,
  border: "none",
  backgroundColor: "#3498db",
  color: "white",
  cursor: "pointer",
};

const listItemStyle = {
  padding: "12px",
  marginBottom: "12px",
  border: "1px solid #ccc",
  borderRadius: "6px",
  backgroundColor: "#f9f9f9",
};
