// src/components/Sidebar.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, LogOut } from "lucide-react";
import api from "../lib/api";

const Sidebar = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const menuRef = useRef(null);

  // Fetch profile from backend
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await api.get("/api/v1/profile/me");
        setProfile(data);
      } catch {
        // Silently ignore — sidebar avatar is non-critical
      }
    };
    fetchProfile();
  }, []);

  // Close dropdown if click outside
  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const handleProfile = () => {
    navigate("/profile");
    setMenuOpen(false);
  };

  const handleLogout = () => {
    if (window.confirm("Sign out of JobFlowAI?")) {
      localStorage.removeItem("token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("token_type");
      navigate("/login");
    }
    setMenuOpen(false);
  };

  // Derive initials
  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "👤";

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* --- Main navigation items here --- */}
      <div className="flex-1">{/* put nav buttons here */}</div>

      {/* --- Avatar at bottom --- */}
      <div className="relative p-4" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600"
        >
          <span className="font-semibold">{initials}</span>
        </button>

        {menuOpen && (
          <div className="absolute bottom-14 left-4 w-48 bg-white text-gray-800 rounded-xl shadow-lg border">
            <button
              onClick={handleProfile}
              className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-gray-100"
            >
              <User size={16} /> {profile ? "My Profile" : "Set up Profile"}
            </button>

            {/* Separator */}
            <div className="border-t my-1"></div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 w-full text-left text-red-600 hover:bg-gray-100"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
