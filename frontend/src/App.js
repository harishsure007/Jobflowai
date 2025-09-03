import React, { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Layouts
import Layout from "./components/Layout";
import DashboardLayout from "./components/DashboardLayout";

// Pages (eager)
import WelcomePage from "./pages/WelcomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

// Features
import ResumeMatcherPage from "./DashboardPages/ResumeMatcherPage";
import EnhanceResumePage from "./DashboardPages/EnhanceResumePage";
import InterviewPrepPage from "./DashboardPages/InterviewPrepPage";
import MyResumesPage from "./DashboardPages/MyResumesPage";
import ResumeCompare from "./components/ResumeCompare";
import ResumeParser from "./components/ResumeParser"; // 👈 NEW
import FeedbackPage from "./api/FeedbackPage";
import ResumeCoverGenerator from "./DashboardPages/ResumeCoverGenerator";
import ProfilePage from "./DashboardPages/ProfilePage";
import JobPostingsPage from "./DashboardPages/JobPostingsPage";
import HelpPage from "./pages/HelpPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

// ✅ Add this import
import MockMatePage from "./DashboardPages/MockMate";

// Placeholder Component
const PlaceholderPage = ({ title, message }) => (
  <div style={placeholderStyle}>
    <h2>{title}</h2>
    <p>{message}</p>
  </div>
);

const placeholderStyle = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  background: "linear-gradient(-45deg, #f2f4f8, #e3f2fd, #dbe9f4, #ffffff)",
};

function App() {
  return (
    <Router>
      {/* Suspense future-proofs if you lazily import any heavy pages later */}
      <Suspense fallback={<div style={{ padding: 20 }}>Loading…</div>}>
        <Routes>
          {/* Public pages with global layout */}
          <Route path="/" element={<Layout><WelcomePage /></Layout>} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/login" element={<Layout><LoginPage /></Layout>} />
          <Route path="/signup" element={<Layout><SignupPage /></Layout>} />
          <Route path="/forgot-password" element={<Layout><ForgotPassword /></Layout>} />
          <Route path="/reset-password" element={<Layout><ResetPassword /></Layout>} />
          <Route path="/resume-cover-generator" element={<ResumeCoverGenerator />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings/password" element={<ChangePasswordPage />} />

          {/* Jobs list under dashboard layout */}
          <Route
            path="/dashboard/jobs"
            element={
              <DashboardLayout>
                <JobPostingsPage />
              </DashboardLayout>
            }
          />

          {/* Dashboard landing (with sidebar) */}
          <Route
            path="/dashboard"
            element={
              <DashboardLayout>
                <DashboardPage />
              </DashboardLayout>
            }
          />

          {/* Feature pages — NO SIDEBAR */}
          <Route
            path="/resume-matcher"
            element={
              <DashboardLayout noSidebar>
                <ResumeMatcherPage />
              </DashboardLayout>
            }
          />
          <Route
            path="/enhance-resume"
            element={
              <DashboardLayout noSidebar>
                <EnhanceResumePage />
              </DashboardLayout>
            }
          />
          <Route
            path="/my-resumes"
            element={
              <DashboardLayout noSidebar>
                <MyResumesPage />
              </DashboardLayout>
            }
          />
          <Route
            path="/interview-prep"
            element={
              <DashboardLayout noSidebar>
                <InterviewPrepPage />
              </DashboardLayout>
            }
          />
          <Route
            path="/resume-compare"
            element={
              <DashboardLayout noSidebar>
                <ResumeCompare />
              </DashboardLayout>
            }
          />
          {/* 👇 Resume Parser (paste OR upload) */}
          <Route
            path="/resume-parser"
            element={
              <DashboardLayout noSidebar>
                <ResumeParser />
              </DashboardLayout>
            }
          />
          <Route
            path="/feedback"
            element={
              <DashboardLayout noSidebar>
                <FeedbackPage />
              </DashboardLayout>
            }
          />

          {/* ✅ NEW: MockMate route */}
          <Route
            path="/mockmate"
            element={
              <DashboardLayout noSidebar>
                <MockMatePage />
              </DashboardLayout>
            }
          />


          {/* OAuth placeholders */}
          <Route
            path="/google-login"
            element={<PlaceholderPage title="🔴 Google Login Page" message="Google authentication logic will go here." />}
          />
          <Route
            path="/linkedin-login"
            element={<PlaceholderPage title="🔗 LinkedIn Login Page" message="LinkedIn authentication logic will go here." />}
          />

          {/* 404 */}
          <Route
            path="*"
            element={
              <PlaceholderPage
                title="404 – Not Found"
                message="The page you're looking for doesn't exist."
              />
            }
          />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
