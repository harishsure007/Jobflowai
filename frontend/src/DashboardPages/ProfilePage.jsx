// src/DashboardPages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { setAuthToken, API_BASE } from "../lib/api";

/* ---- Fixed endpoints (only /api/v1/*) ---- */
const READ_ENDPOINT = "/api/v1/profile/me";
const WRITE_CANDIDATES = [
  { method: "put",   url: "/api/v1/profile/me" },
  { method: "put",   url: "/api/v1/profile"   },
  { method: "post",  url: "/api/v1/profile"   },
  { method: "patch", url: "/api/v1/profile"   }, // compatibility fallback
];

const isValidEmail = (e) => typeof e === "string" && /\S+@\S+\.\S+/.test(e);

function normalizeError(errLike) {
  try {
    const detail =
      errLike?.response?.data?.detail ??
      errLike?.response?.data ??
      errLike?.message ??
      errLike;

    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          const loc = d && typeof d === "object" && Array.isArray(d.loc) ? d.loc.join(".") : (d?.loc ?? "");
          return `${loc || "error"}: ${d?.msg || d?.type || "error"}`;
        })
        .join(" | ");
    }
    if (detail && typeof detail === "object") {
      if (detail.msg) {
        const loc = Array.isArray(detail.loc) ? detail.loc.join(".") : (detail.loc ?? "");
        return `${loc || "error"}: ${detail.msg}`;
      }
      try {
        return JSON.stringify(detail);
      } catch {
        return String(detail);
      }
    }
    return String(detail);
  } catch {
    return "Unexpected error";
  }
}

/* ---------- helpers used before component ---------- */
function emptyProfile() {
  return {
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
    summary: "",
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    extras_text: "",
  };
}

function safeJSONString(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return "";
  }
}

function normalizeIncoming(raw) {
  const d = raw?.profile ? raw.profile : (raw || {});
  const extrasGuess = d?.extras ?? d?.meta ?? undefined;
  return {
    id: d?.id ?? null,
    full_name: d?.full_name || d?.name || "",
    email: d?.email || "",
    phone: d?.phone || "",
    location: d?.location || "",
    linkedin: d?.linkedin || d?.linked_in || "",
    github: d?.github || "",
    portfolio: d?.portfolio || d?.website || "",
    summary: d?.summary || d?.about || "",
    skills: Array.isArray(d?.skills) ? d.skills : (extrasGuess?.skills || []),
    experience: Array.isArray(d?.experience) ? d.experience : (extrasGuess?.experience || []),
    projects: Array.isArray(d?.projects) ? d.projects : (extrasGuess?.projects || []),
    education: Array.isArray(d?.education) ? d.education : (extrasGuess?.education || []),
    certifications: Array.isArray(d?.certifications) ? d.certifications : (extrasGuess?.certifications || []),
    extras_text: extrasGuess ? safeJSONString(extrasGuess) : "",
  };
}

function toPayload(fIn) {
  const f = fIn || {};
  const trimOrNull = (v) => (typeof v === "string" ? v.trim() : v == null ? null : String(v).trim());

  const base = {
    full_name: trimOrNull(f.full_name) || "",
    email: trimOrNull(f.email) || "",
    phone: trimOrNull(f.phone),
    location: trimOrNull(f.location),
    linkedin: trimOrNull(f.linkedin),
    github: trimOrNull(f.github),
    portfolio: trimOrNull(f.portfolio),
    summary: typeof f.summary === "string" ? f.summary : null,
    about: typeof f.summary === "string" ? f.summary : null, // compatibility alias
  };

  const extras = {
    skills: Array.isArray(f.skills) ? f.skills : [],
    experience: Array.isArray(f.experience) ? f.experience : [],
    projects: Array.isArray(f.projects) ? f.projects : [],
    education: Array.isArray(f.education) ? f.education : [],
    certifications: Array.isArray(f.certifications) ? f.certifications : [],
  };

  if (typeof f.extras_text === "string" && f.extras_text.trim()) {
    try {
      Object.assign(extras, JSON.parse(f.extras_text));
    } catch {
      extras.note = f.extras_text;
    }
  }

  const payload = { ...base, extras };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return payload;
}

function deriveInitials(name) {
  let n = typeof name === "string" ? name : name == null ? "" : String(name);
  n = n.trim();
  if (!n) return "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------- component ---------- */
export default function ProfilePage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [writeEndpoint, setWriteEndpoint] = useState("");

  const [form, setForm] = useState(() => emptyProfile());

  // Ensure Authorization is set on mount
  useEffect(() => {
    const t = localStorage.getItem("token") || localStorage.getItem("access_token");
    const type = localStorage.getItem("token_type") || "Bearer";
    if (!t) {
      setErr("You’re not logged in. Please sign in.");
      setLoading(false);
      return;
    }
    setAuthToken(t, type);
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    setLoading(true);
    setErr("");
    setOk("");
    try {
      const { data, status } = await api.get(READ_ENDPOINT, {
        headers: { Accept: "application/json" },
        validateStatus: () => true,
      });

      if (status === 200) {
        setForm(normalizeIncoming(data));
      } else if (status === 204 || data == null || data === "") {
        // No content/body yet — treat as empty profile
        setForm(emptyProfile());
      } else if (status === 401) {
        setErr("Session expired. Please sign in again.");
      } else if (status === 404) {
        // Not created yet — let user fill and save
        setForm(emptyProfile());
      } else {
        throw { response: { data } };
      }
    } catch (e) {
      setErr(normalizeError(e) || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!form.full_name || !String(form.full_name).trim()) {
      setErr("Full name is required.");
      return;
    }
    if (!isValidEmail(form.email)) {
      setErr("Please enter a valid email (e.g., name@example.com).");
      return;
    }

    setSaving(true);
    setErr("");
    setOk("");

    const payload = toPayload(form);

    let lastErr = null;
    for (const c of WRITE_CANDIDATES) {
      try {
        const { data, status } = await api.request({
          method: c.method,
          url: c.url,
          data: payload,
          headers: { "Content-Type": "application/json" },
          validateStatus: () => true,
        });

        if (status === 401) {
          lastErr = new Error("Unauthorized – please sign in and try again.");
          break;
        }

        if (status === 200 || status === 201) {
          const saved = data?.profile ? data.profile : data;
          setWriteEndpoint(`${API_BASE}${c.url}`);
          setForm(normalizeIncoming(saved || {}));
          setOk("Profile saved!");
          setSaving(false);
          return;
        }

        if (status === 204) {
          // Saved but no payload — reload to display current server state
          setWriteEndpoint(`${API_BASE}${c.url}`);
          await loadProfile();
          setOk("Profile saved!");
          setSaving(false);
          return;
        }

        lastErr = new Error(
          `${c.method.toUpperCase()} ${c.url} -> ${status}: ${normalizeError({
            response: { data },
          })}`
        );
      } catch (e) {
        lastErr = e;
        break;
      }
    }

    setSaving(false);
    setErr(normalizeError(lastErr) || "Failed to save profile.");
  }

  const initials = useMemo(() => deriveInitials(form?.full_name ?? ""), [form.full_name]);

  if (loading) return <div style={sx.page}>Loading profile…</div>;

  return (
    <div style={sx.page}>
      <style>{styles}</style>

      <header className="pf-header">
        <div className="pf-header-left">
          <div className="pf-avatar" title={form.full_name || "Your name"}>
            {initials || "👤"}
          </div>
          <div>
            <h1 className="pf-title">My Profile</h1>
            <div className="pf-sub">Edit your details used to auto-generate resumes.</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              <div><strong>Read from:</strong> {API_BASE}{READ_ENDPOINT}</div>
              <div><strong>Last write to:</strong> {writeEndpoint || "—"}</div>
            </div>
          </div>
        </div>
        <div className="pf-actions">
          <button className="btn ghost" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn" onClick={saveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {err && (<div className="pf-error"><strong>Error:</strong> <span>{err}</span></div>)}
      {ok && (<div className="pf-ok"><strong>{ok}</strong></div>)}

      <section className="pf-card">
        <h2>Contact & Links</h2>
        <div className="grid2">
          <Input label="Full name" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} required />
          <Input label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} required />
          <Input label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <Input label="Location" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} />
          <Input label="LinkedIn" value={form.linkedin} onChange={(v) => setForm((f) => ({ ...f, linkedin: v }))} />
          <Input label="GitHub" value={form.github} onChange={(v) => setForm((f) => ({ ...f, github: v }))} />
          <Input label="Portfolio" value={form.portfolio} onChange={(v) => setForm((f) => ({ ...f, portfolio: v }))} className="span2" />
        </div>
      </section>

      <section className="pf-card">
        <h2>Professional Summary</h2>
        <Textarea
          value={form.summary}
          onChange={(v) => setForm((f) => ({ ...f, summary: v }))}
          placeholder="2–4 lines that sell your value"
          rows={4}
        />
      </section>

      <section className="pf-card">
        <h2>Skills <span className="hint">(press Enter to add)</span></h2>
        <Chips
          value={form.skills}
          onChange={(arr) => setForm((f) => ({ ...f, skills: arr }))}
          placeholder="e.g., Python, SQL, Java, React"
        />
      </section>

      <section className="pf-card">
        <h2>Experience</h2>
        <List
          items={form.experience}
          onChange={(arr) => setForm((f) => ({ ...f, experience: arr }))}
          renderItem={(item, idx, update, remove) => (
            <div className="grid2">
              <Input label="Company" value={item.company || ""} onChange={(v) => update({ ...item, company: v })} required />
              <Input label="Title" value={item.title || ""} onChange={(v) => update({ ...item, title: v })} required />
              <Input label="Start" value={item.start || ""} onChange={(v) => update({ ...item, start: v })} placeholder="2022-05 or May 2022" />
              <Input label="End" value={item.end || ""} onChange={(v) => update({ ...item, end: v })} placeholder="Present or 2024-08" />
              <Input label="Location" value={item.location || ""} onChange={(v) => update({ ...item, location: v })} />
              <Bullets label="Impact bullets" value={Array.isArray(item.bullets) ? item.bullets : []} onChange={(v) => update({ ...item, bullets: v })} />
              <div className="row-right span2">
                <button className="btn danger ghost" onClick={remove}>Remove role</button>
              </div>
            </div>
          )}
          makeNew={() => ({ company: "", title: "", start: "", end: "", location: "", bullets: [] })}
        />
      </section>

      <section className="pf-card">
        <h2>Projects</h2>
        <List
          items={form.projects}
          onChange={(arr) => setForm((f) => ({ ...f, projects: arr }))}
          renderItem={(item, idx, update, remove) => (
            <div className="grid2">
              <Input label="Name" value={item.name || ""} onChange={(v) => update({ ...item, name: v })} required />
              <Chips label="Stack / tags" value={Array.isArray(item.stack) ? item.stack : []} onChange={(v) => update({ ...item, stack: v })} placeholder="e.g., Java, Spring Boot, Kafka" />
              <Bullets label="Highlights" value={Array.isArray(item.bullets) ? item.bullets : []} onChange={(v) => update({ ...item, bullets: v })} />
              <div className="row-right span2">
                <button className="btn danger ghost" onClick={remove}>Remove project</button>
              </div>
            </div>
          )}
          makeNew={() => ({ name: "", stack: [], bullets: [] })}
        />
      </section>

      <section className="pf-card">
        <h2>Education</h2>
        <List
          items={form.education}
          onChange={(arr) => setForm((f) => ({ ...f, education: arr }))}
          renderItem={(item, idx, update, remove) => (
            <div className="grid2">
              <Input label="Degree" value={item.degree || ""} onChange={(v) => update({ ...item, degree: v })} required />
              <Input label="School" value={item.school || ""} onChange={(v) => update({ ...item, school: v })} required />
              <Input label="Year" value={item.year || ""} onChange={(v) => update({ ...item, year: v })} />
              <Bullets label="Details" value={Array.isArray(item.details) ? item.details : []} onChange={(v) => update({ ...item, details: v })} />
              <div className="row-right span2">
                <button className="btn danger ghost" onClick={remove}>Remove education</button>
              </div>
            </div>
          )}
          makeNew={() => ({ degree: "", school: "", year: "", details: [] })}
        />
      </section>

      <section className="pf-card">
        <h2>Certifications</h2>
        <List
          items={form.certifications}
          onChange={(arr) => setForm((f) => ({ ...f, certifications: arr }))}
          renderItem={(item, idx, update, remove) => (
            <div className="grid2">
              <Input label="Name" value={item.name || ""} onChange={(v) => update({ ...item, name: v })} required />
              <Input label="Year" value={item.year || ""} onChange={(v) => update({ ...item, year: v })} />
              <Input label="Organization" value={item.org || ""} onChange={(v) => update({ ...item, org: v })} />
              <div className="row-right span2">
                <button className="btn danger ghost" onClick={remove}>Remove certification</button>
              </div>
            </div>
          )}
          makeNew={() => ({ name: "", year: "", org: "" })}
        />
      </section>

      <section className="pf-card">
        <h2>Extras (optional)</h2>
        <Textarea
          value={form.extras_text}
          onChange={(v) => setForm((f) => ({ ...f, extras_text: v }))}
          placeholder="Any custom JSON-like notes you want to pass to the generator (kept as text)."
          rows={4}
        />
      </section>

      <footer className="pf-footer">
        <button className="btn ghost" onClick={() => navigate(-1)}>Cancel</button>
        <button className="btn" onClick={saveProfile} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </footer>
    </div>
  );
}

/* ---------- tiny UI primitives ---------- */
function Input({ label, className, onChange, ...props }) {
  return (
    <label className={`pf-label ${className || ""}`}>
      <span>{label}</span>
      <input
        className="pf-input"
        {...props}
        onChange={(e) => onChange && onChange(e.target.value)}
      />
    </label>
  );
}

function Textarea({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <label className="pf-label">
      {label && <span>{label}</span>}
      <textarea
        className="pf-textarea"
        rows={rows}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Chips({ label, value, onChange, placeholder }) {
  const [text, setText] = useState("");
  const items = Array.isArray(value) ? value : [];
  function addChip() {
    const t = text.trim();
    if (!t) return;
    const next = Array.from(new Set([...(items || []), t]));
    onChange && onChange(next);
    setText("");
  }
  function removeChip(i) {
    const next = items.filter((_, idx) => idx !== i);
    onChange && onChange(next);
  }
  return (
    <div className="chips">
      {label && <div className="chips-label">{label}</div>}
      <div className="chips-row">
        {(items || []).map((s, i) => (
          <span key={i} className="chip" onClick={() => removeChip(i)} title="Click to remove">
            {s} ✕
          </span>
        ))}
        <input
          className="chips-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip();
            }
          }}
          placeholder={placeholder || "Type and press Enter"}
        />
      </div>
    </div>
  );
}

function Bullets({ label, value, onChange }) {
  const [text, setText] = useState("");
  const items = Array.isArray(value) ? value : [];
  function add() {
    const t = text.trim();
    if (!t) return;
    onChange && onChange([...(items || []), t]);
    setText("");
  }
  function remove(i) {
    onChange && onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div className="bullets span2">
      <div className="chips-label">{label || "Bullets"}</div>
      <div className="bullets-list">
        {(items || []).map((b, i) => (
          <div key={i} className="bullet-item">
            <span>• {b}</span>
            <button className="link danger" onClick={() => remove(i)}>remove</button>
          </div>
        ))}
      </div>
      <div className="bullets-add">
        <input
          className="pf-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a quantified impact bullet and press Add"
        />
        <button className="btn ghost" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function List({ items, onChange, renderItem, makeNew }) {
  const arr = Array.isArray(items) ? items : [];
  function add() {
    onChange && onChange([...(arr || []), makeNew()]);
  }
  function updateAt(idx, next) {
    onChange && onChange(arr.map((it, i) => (i === idx ? next : it)));
  }
  function removeAt(idx) {
    onChange && onChange(arr.filter((_, i) => i !== idx));
  }
  return (
    <div className="list">
      {arr.length === 0 && <div className="empty">No items yet.</div>}
      {arr.map((item, idx) => (
        <div key={idx} className="list-item">
          {renderItem(item, idx, (next) => updateAt(idx, next), () => removeAt(idx))}
        </div>
      ))}
      <div className="row-right">
        <button className="btn ghost" onClick={add}>Add item</button>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const sx = {
  page: { maxWidth: 1000, margin: "0 auto", padding: 20 },
};

const styles = `
  .pf-header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin: 8px 0 16px; }
  .pf-header-left { display:flex; align-items:center; gap:12px; }
  .pf-avatar { width:44px; height:44px; border-radius:50%; background:#1f3b4d; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; }
  .pf-title { margin:0; font-size:20px; }
  .pf-sub { font-size:12px; color:#666; }
  .pf-actions { display:flex; gap:8px; }

  .pf-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin:12px 0; }
  .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
  .span2 { grid-column: span 2; }

  .pf-label { display:flex; flex-direction:column; gap:4px; }
  .pf-label > span { font-size:12px; color:#555; }
  .pf-input, .pf-textarea { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:10px; font-size:14px; }
  .pf-textarea { min-height: 100px; }

  .chips { display:flex; flex-direction:column; gap:6px; }
  .chips-label { font-size:12px; color:#555; }
  .chips-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .chips-input { border:1px solid #d1d5db; border-radius:999px; padding:8px 12px; min-width: 240px; }
  .chip { background:#e0ecf4; color:#1f3b4d; padding:6px 10px; border-radius:999px; cursor:pointer; user-select:none; }

  .bullets { display:flex; flex-direction:column; gap:8px; }
  .bullets-list { display:flex; flex-direction:column; gap:6px; }
  .bullet-item { display:flex; align-items:center; justify-content:space-between; gap:8px; background:#f8fafc; border:1px solid #eef2f7; border-radius:8px; padding:8px 10px; }

  .list { display:flex; flex-direction:column; gap:12px; }
  .list-item { background:#fbfbfb; border:1px solid #f0f2f5; border-radius:10px; padding:12px; }

  .row-right { display:flex; justify-content:flex-end; }

  .btn { background:#1f3b4d; color:#fff; border:none; padding:10px 14px; border-radius:8px; cursor:pointer; font-weight:600; }
  .btn:disabled { opacity:.6; cursor:default; }
  .btn.ghost { background:transparent; color:#1f3b4d; border:1px solid #1f3b4d; }
  .btn.danger { color:#d22; border-color:#d22; }
  .btn.danger.ghost { color:#d22; border:1px solid #d22; }
  .link { background:none; border:none; color:#1f3b4d; cursor:pointer; padding:4px 6px; }
  .link.danger { color:#d22; }

  .pf-error { background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:10px 12px; border-radius:8px; margin: 8px 0; }
  .pf-ok { background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; padding:10px 12px; border-radius:8px; margin: 8px 0; }
`;
