import axios from "axios";

// Set baseURL to your FastAPI backend
const API = axios.create({
  baseURL: "http://127.0.0.1:8000/api/v1", // change if backend URL differs
});

// Create new feedback
export const createFeedback = (data) => API.post("/feedback/", data);

// Get all feedback
export const getAllFeedback = () => API.get("/feedback/");

// Get feedback by ID
export const getFeedbackById = (id) => API.get(`/feedback/${id}`);

// Update feedback
export const updateFeedback = (id, data) => API.put(`/feedback/${id}`, data);

// Delete feedback
export const deleteFeedback = (id) => API.delete(`/feedback/${id}`);
