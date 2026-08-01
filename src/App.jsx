import React, { useState, useMemo, useEffect, useRef } from "react";
import { SLA_CATALOG, SLA_UNITS, calcExpectedDate, findSlaItem } from "./slaData";
import { supabase, rowToRecord, recordToRow, patchToRow } from "./supabaseClient";

// ============================================================================
// WHO PSU / CSU Request Tracker
// Three surfaces: Submit a request · Dashboard · Admin (status updates)
// Data lives in Supabase — see .design/psu-request-tracker/ for schema notes.
// ============================================================================

const CLUSTERS = ["PEP", "DPC", "EPR", "VPD", "CSU", "HSS"];
const STATES = [
  "Abuja","Abia","Akwa Ibom","Anambra","Ebonyi","Enugu","Imo","Bayelsa",
  "Cross Rivers","Delta","Edo","Rivers","Ekiti","Lagos","Ondo","Osun","Oyo","Ogun","Jigawa"
];
const STATUSES = ["Pending", "In Progress", "Completed", "On Hold"];

const STATUS_META = {
  "Pending":     { fg: "var(--status-pending-fg)",  bg: "var(--status-pending-bg)",  dot: "var(--status-pending-dot)",  label: "Pending" },
  "In Progress": { fg: "var(--status-progress-fg)", bg: "var(--status-progress-bg)", dot: "var(--status-progress-dot)", label: "In progress" },
  "Completed":   { fg: "var(--status-completed-fg)", bg: "var(--status-completed-bg)", dot: "var(--status-completed-dot)", label: "Completed" },
  "On Hold":     { fg: "var(--status-hold-fg)",     bg: "var(--status-hold-bg)",     dot: "var(--status-hold-dot)",     label: "On hold" },
};
// Color constants reference CSS custom properties (see tokens.css) so the
// whole app repaints on [data-theme] change with no per-component logic.
const WHO = "var(--color-accent-primary)";
const WHO_DARK = "var(--color-accent-primary-hover)";
const INK = "var(--color-text-primary)";
const MUTE = "var(--color-text-secondary)";
const LINE = "var(--color-border-primary)";
const PAPER = "var(--color-bg-tertiary)";
const SURFACE = "var(--color-bg-secondary)";
const SURFACE_HOVER = "var(--color-bg-hover)";
const TEXT_INVERSE = "var(--color-text-inverse)";
const DANGER = "var(--color-danger)";
const MONO = "var(--font-family-mono)";

const uid = () => "REQ-" + Math.floor(1000 + Math.random() * 9000) + "-" + Date.now().toString().slice(-4);
const today = () => new Date().toISOString().slice(0, 10);

function daysBetween(a, b) {
  if (!a || !b) return null;
  const d = (new Date(b) - new Date(a)) / 86400000;
  return Math.round(d);
}
function isOverdue(r) {
  return r.status !== "Completed" && r.status !== "On Hold" &&
         r.expected && new Date(r.expected) < new Date(today());
}

// CSV export -------------------------------------------------------------
const CSV_COLUMNS = [
  ["id", "Ref"], ["state", "State"], ["cluster", "Cluster"],
  ["slaUnit", "Support Unit"], ["slaService", "Service Requested"], ["slaTurnaround", "SLA Target"],
  ["description", "Request"], ["requestedBy", "Requested By"], ["location", "Location"],
  ["dateSent", "Date Sent"], ["expected", "Expected"], ["actual", "Actual"],
  ["status", "Status"], ["notes", "Notes"],
];
function csvEscape(v) {
  const s = (v ?? "").toString();
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportRowsToCSV(rows, filename) {
  const lines = [CSV_COLUMNS.map(([, label]) => csvEscape(label)).join(",")];
  rows.forEach(r => lines.push(CSV_COLUMNS.map(([key]) => csvEscape(r[key])).join(",")));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------
function StatusPill({ status, small }) {
  const m = STATUS_META[status] || STATUS_META["Pending"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: m.bg, color: m.fg, borderRadius: 20,
      padding: small ? "2px 9px" : "3px 11px", fontSize: small ? 11.5 : 12.5,
      fontWeight: 600, whiteSpace: "nowrap", letterSpacing: 0.1,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: m.dot }} />
      {m.label}
    </span>
  );
}
// ---------------------------------------------------------------------------
// Header / nav
// ---------------------------------------------------------------------------
function TopBar({ tab, setTab, dark, onToggleDark }) {
  const tabs = [
    { k: "submit", label: "Submit a request" },
    { k: "dash", label: "Dashboard" },
    { k: "admin", label: "Admin" },
  ];
  return (
    <div style={{ background: SURFACE, borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, zIndex: 30 }}>
      <div className="topbar-row" style={{ maxWidth: "var(--max-width-page)", margin: "0 auto", padding: "10px 22px", display: "flex", alignItems: "center", gap: 20, minHeight: 62 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/who-logo.svg" alt="WHO" style={{ width: 34, height: 34, borderRadius: "var(--radius-sm)", display: "block", flexShrink: 0 }} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: "var(--font-weight-black)", color: INK, fontSize: 15, letterSpacing: "var(--letter-spacing-tight)", whiteSpace: "nowrap" }}>PSU Request Tracker</div>
            <div className="topbar-subtitle" style={{ fontSize: 11.5, color: MUTE, whiteSpace: "nowrap" }}>Programme Support Unit · WHO Country Office</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <nav className="topbar-nav" style={{ display: "flex", gap: 4, background: PAPER, padding: 4, borderRadius: "var(--radius-md)" }}>
          {tabs.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              border: "none", cursor: "pointer", borderRadius: "var(--radius-sm)", padding: "8px 15px",
              fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
              background: tab === t.k ? SURFACE : "transparent",
              color: tab === t.k ? WHO_DARK : MUTE,
              transition: `background var(--duration-fast) var(--easing-default), color var(--duration-fast) var(--easing-default)`,
            }}>
              {t.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onToggleDark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            border: `1px solid ${LINE}`, background: PAPER, color: INK, borderRadius: "var(--radius-sm)",
            width: 34, height: 34, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {dark ? "☀" : "☾"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUBMIT — form filler
// ---------------------------------------------------------------------------
function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 5 }}>{hint}</div>}
    </label>
  );
}
const inputStyle = {
  width: "100%", boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: "var(--radius-sm)",
  padding: "10px 12px", fontSize: 14, fontFamily: "inherit", color: INK, background: SURFACE, outline: "none",
};

function SubmitView({ onCreate }) {
  const blank = { cluster: "PEP", description: "", requestedBy: "", location: "", state: "", unit: "", service: "", notes: "" };
  const [f, setF] = useState(blank);
  const [done, setDone] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const serviceOptions = f.unit ? SLA_CATALOG[f.unit] : [];
  const slaItem = f.unit && f.service ? findSlaItem(f.unit, f.service) : null;
  const previewExpected = slaItem ? calcExpectedDate(today(), slaItem.turnaround) : "";

  const valid = f.description.trim() && f.requestedBy.trim() && f.location.trim() && f.state && f.unit && f.service;

  function chooseUnit(unit) {
    setF(p => ({ ...p, unit, service: "" }));
  }
  function chooseService(desc) {
    const item = findSlaItem(f.unit, desc);
    setF(p => ({ ...p, service: desc, description: p.description.trim() ? p.description : (item ? item.description : p.description) }));
  }

  async function submit() {
    if (!valid || submitting) return;
    const item = findSlaItem(f.unit, f.service);
    const expected = item ? calcExpectedDate(today(), item.turnaround) : "";
    const rec = {
      id: uid(), cluster: f.cluster, description: f.description.trim(),
      requestedBy: f.requestedBy.trim(), location: f.location.trim(), state: f.state,
      dateSent: today(), status: "Pending", expected, actual: "",
      slaUnit: f.unit, slaService: item ? item.description : "", slaBusinessArea: item ? item.businessArea : "", slaTurnaround: item ? item.turnaround : "",
      notes: f.notes.trim(),
      history: [{ t: today(), by: f.requestedBy.trim(), note: "Request submitted." }],
    };
    setSubmitting(true);
    setSubmitError("");
    const result = await onCreate(rec);
    setSubmitting(false);
    if (result && result.error) {
      setSubmitError(result.error);
      return;
    }
    setDone(rec);
    setF(blank);
  }

  if (done) {
    return (
      <Shell>
        <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: "var(--radius-lg)", padding: "38px 34px", textAlign: "center", maxWidth: 560, margin: "10px auto" }}>
          <div style={{ width: 52, height: 52, borderRadius: "var(--radius-full)", background: STATUS_META.Completed.bg, color: STATUS_META.Completed.dot, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26 }}>✓</div>
          <h2 style={{ margin: "0 0 6px", color: INK, fontSize: 21 }}>Request logged</h2>
          <p style={{ color: MUTE, margin: "0 0 4px", fontSize: 14 }}>Your request has been added to the tracker with reference</p>
          <div style={{ fontFamily: MONO, fontWeight: 600, color: WHO_DARK, fontSize: 18, marginBottom: 20, letterSpacing: "var(--letter-spacing-wide)" }}>{done.id}</div>
          {done.expected ? (
            <p style={{ color: MUTE, fontSize: 13, margin: "0 0 4px" }}>
              Expected by <strong style={{ color: INK }}>{done.expected}</strong>, per the {done.slaUnit} SLA ({done.slaTurnaround}).
            </p>
          ) : done.slaTurnaround && (
            <p style={{ color: MUTE, fontSize: 13, margin: "0 0 4px" }}>
              SLA target: <strong style={{ color: INK }}>{done.slaTurnaround}</strong> — the PSU team will confirm an exact date.
            </p>
          )}
          <p style={{ color: MUTE, fontSize: 13, margin: "0 0 22px" }}>
            The PSU team will review and set a status. You can follow progress on the dashboard.
          </p>
          <button onClick={() => setDone(null)} style={primaryBtn}>Submit another request</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }} className="submit-grid">
        <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: "var(--radius-lg)", padding: "26px 28px" }}>
          <h2 style={{ margin: "0 0 4px", color: INK, fontSize: 20, letterSpacing: "var(--letter-spacing-tight)" }}>Submit a support request</h2>
          <p style={{ color: MUTE, margin: "0 0 22px", fontSize: 13.5 }}>
            For procurement, payments, IT, admin and logistics handled by the Programme Support Unit.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
            <Field label="Cluster">
              <select style={inputStyle} value={f.cluster} onChange={e => set("cluster", e.target.value)}>
                {CLUSTERS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="State / office">
              <select style={inputStyle} value={f.state} onChange={e => set("state", e.target.value)}>
                <option value="">Select a state…</option>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
            <Field label="Support unit" hint="Who handles this — sets the SLA below.">
              <select style={inputStyle} value={f.unit} onChange={e => chooseUnit(e.target.value)}>
                <option value="">Select a unit…</option>
                {SLA_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Service requested">
              <select style={inputStyle} value={f.service} onChange={e => chooseService(e.target.value)} disabled={!f.unit}>
                <option value="">{f.unit ? "Select a service…" : "Pick a support unit first"}</option>
                {serviceOptions.map((s, i) => <option key={i} value={s.description}>{s.businessArea} — {s.description}</option>)}
              </select>
            </Field>
          </div>

          {slaItem && (
            <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}>
              <span style={{ fontWeight: 700, color: INK }}>SLA target: {slaItem.turnaround}.</span>{" "}
              {previewExpected ? (
                <span style={{ color: MUTE }}>Expected by <strong style={{ color: WHO_DARK }}>{previewExpected}</strong>, calculated automatically from today.</span>
              ) : (
                <span style={{ color: MUTE }}>This SLA counts down to an external date (event, expiry, or cycle) — the PSU team will confirm the exact due date.</span>
              )}
            </div>
          )}

          <Field label="Request description" hint="Be specific — what is needed, quantity, and any reference or ticket.">
            <textarea style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
              value={f.description} onChange={e => set("description", e.target.value)}
              placeholder="e.g. Payment of DSA for 12 participants — June OBR review meeting" />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
            <Field label="Requested by">
              <input style={inputStyle} value={f.requestedBy} onChange={e => set("requestedBy", e.target.value)} placeholder="Full name" />
            </Field>
            <Field label="Location">
              <input style={inputStyle} value={f.location} onChange={e => set("location", e.target.value)} placeholder="Town / LGA" />
            </Field>
          </div>

          <Field label="Notes for the PSU team">
            <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
              value={f.notes} onChange={e => set("notes", e.target.value)}
              placeholder="Any context, budget line, or supporting detail" />
          </Field>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
            <button onClick={submit} disabled={!valid || submitting} style={{ ...primaryBtn, opacity: valid && !submitting ? 1 : 0.45, cursor: valid && !submitting ? "pointer" : "not-allowed" }}>
              {submitting ? "Submitting…" : "Submit request"}
            </button>
            {!valid && <span style={{ fontSize: 12.5, color: MUTE }}>State, support unit, service, description, requester and location are required.</span>}
            {submitError && <span style={{ fontSize: 12.5, color: DANGER }}>{submitError}</span>}
          </div>
        </div>

        <aside style={{ display: "grid", gap: 14 }}>
          <div style={{ background: WHO_DARK, borderRadius: "var(--radius-lg)", padding: "20px 20px", color: TEXT_INVERSE }}>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9, marginBottom: 8 }}>How it works</div>
            {["Submit your request here","PSU reviews and sets a status","Track progress on the dashboard","PSU updates status through to completion"].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                <span style={{ width: 20, height: 20, borderRadius: "var(--radius-full)", background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 13, lineHeight: 1.4, opacity: 0.95 }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 6 }}>Turnaround</div>
            <p style={{ fontSize: 12.5, color: MUTE, margin: 0, lineHeight: 1.5 }}>
              Most requests are actioned within 5 working days. Payment requests routed to the CSU Service Centre receive an INC ticket number.
            </p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
function StatCard({ label, value, accent, sub }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: "var(--radius-md)", padding: "16px 18px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <div style={{ fontSize: 12, color: MUTE, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 600, color: INK, letterSpacing: "var(--letter-spacing-tight)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function Bar({ label, value, total, color }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ color: INK, fontWeight: 600 }}>{label}</span>
        <span style={{ color: MUTE }}>{value} · {pct}%</span>
      </div>
      <div style={{ height: 8, background: PAPER, borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: "var(--radius-sm)", transition: `width var(--duration-normal) var(--easing-default)` }} />
      </div>
    </div>
  );
}

function DashView({ rows }) {
  const total = rows.length;
  const by = s => rows.filter(r => r.status === s).length;
  const overdue = rows.filter(isOverdue).length;
  const completed = by("Completed");
  const rate = total ? Math.round((completed / total) * 100) : 0;

  // cluster breakdown
  const clusterCounts = useMemo(() => {
    const m = {};
    rows.forEach(r => { m[r.cluster] = (m[r.cluster] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // state breakdown
  const stateCounts = useMemo(() => {
    const m = {};
    rows.forEach(r => { m[r.state] = (m[r.state] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);

  const recent = [...rows].sort((a, b) => (b.dateSent || "").localeCompare(a.dateSent || "")).slice(0, 6);
  const maxState = Math.max(1, ...stateCounts.map(s => s[1]));

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: INK, fontSize: 20, letterSpacing: "var(--letter-spacing-tight)" }}>Dashboard</h2>
        <span style={{ color: MUTE, fontSize: 13 }}>Live view across all clusters and offices</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 18 }} className="stat-grid">
        <StatCard label="Total requests" value={total} accent={WHO} />
        <StatCard label="Pending" value={by("Pending")} accent={STATUS_META.Pending.dot} />
        <StatCard label="In progress" value={by("In Progress")} accent={STATUS_META["In Progress"].dot} />
        <StatCard label="Completed" value={completed} accent={STATUS_META.Completed.dot} sub={rate + "% completion"} />
        <StatCard label="Overdue" value={overdue} accent={STATUS_META["On Hold"].dot} sub={overdue ? "needs attention" : "all on track"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18, marginBottom: 18 }} className="dash-grid">
        <Panel title="Status breakdown">
          {STATUSES.map(s => (
            <Bar key={s} label={STATUS_META[s].label} value={by(s)} total={total} color={STATUS_META[s].dot} />
          ))}
        </Panel>
        <Panel title="By cluster">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
            {clusterCounts.map(([c, n]) => (
              <div key={c} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${PAPER}` }}>
                <span style={{ fontSize: 13, color: INK, fontWeight: 600 }}>{c}</span>
                <span style={{ fontSize: 13, color: MUTE }}>{n}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 18 }} className="dash-grid">
        <Panel title="Top offices by volume">
          {stateCounts.map(([s, n]) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 11 }}>
              <span style={{ width: 92, fontSize: 12.5, color: INK, fontWeight: 600 }}>{s}</span>
              <div style={{ flex: 1, height: 20, background: PAPER, borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <div style={{ width: (n / maxState * 100) + "%", height: "100%", background: WHO, borderRadius: "var(--radius-sm)" }} />
              </div>
              <span style={{ width: 24, textAlign: "right", fontSize: 12.5, color: MUTE }}>{n}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Recent activity">
          {recent.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${PAPER}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: INK, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>
                <div style={{ fontSize: 11.5, color: MUTE }}>{r.requestedBy} · {r.location} · {r.dateSent || "—"}</div>
              </div>
              <StatusPill status={r.status} small />
            </div>
          ))}
        </Panel>
      </div>
    </Shell>
  );
}

function FilterField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTE, textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wide)", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function MultiSelectFilter({ options, selected, onChange, width = 170 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggle = opt => onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  const summary = selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        ...inputStyle, width, cursor: "pointer", background: SURFACE,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        color: selected.length ? INK : MUTE,
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
        <span style={{ color: MUTE, fontSize: 10 }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, background: SURFACE,
          border: `1px solid ${LINE}`, borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)",
          padding: 6, minWidth: width, maxHeight: 240, overflow: "auto",
        }}>
          {options.map(opt => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13, color: INK }}>
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} style={{
              width: "100%", textAlign: "left", marginTop: 4, border: "none", borderTop: `1px solid ${PAPER}`,
              background: "none", color: WHO_DARK, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 8px 2px",
            }}>Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function AdminSignIn({ onSignIn, compact }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim() || busy) return;
    setBusy(true);
    const result = await onSignIn(email.trim(), password);
    setBusy(false);
    if (result.ok) {
      setEmail("");
      setPassword("");
      setError("");
    } else {
      setError(result.error || "Sign-in failed");
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="email"
        value={email}
        onChange={e => { setEmail(e.target.value); setError(""); }}
        placeholder="Admin email"
        autoComplete="username"
        style={{ ...inputStyle, width: compact ? 160 : 180, border: `1px solid ${error ? DANGER : LINE}` }}
      />
      <input
        type="password"
        value={password}
        onChange={e => { setPassword(e.target.value); setError(""); }}
        placeholder="Password"
        autoComplete="current-password"
        style={{ ...inputStyle, width: compact ? 130 : 150, border: `1px solid ${error ? DANGER : LINE}` }}
      />
      <button type="submit" disabled={busy} style={{ ...primaryBtn, padding: "9px 16px", fontSize: 12.5, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && <span style={{ fontSize: 12, color: DANGER }}>{error}</span>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// ADMIN — status updates
// ---------------------------------------------------------------------------
function AdminView({ rows, update, isAdmin, onSignIn, onSignOut }) {
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState([]);
  const [fCluster, setFCluster] = useState([]);
  const [fState, setFState] = useState([]);
  const [fOverdue, setFOverdue] = useState("All");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [open, setOpen] = useState(null);

  const filtersActive = q || fStatus.length || fCluster.length || fState.length || fOverdue !== "All" || fDateFrom || fDateTo;

  function resetFilters() {
    setQ(""); setFStatus([]); setFCluster([]); setFState([]); setFOverdue("All"); setFDateFrom(""); setFDateTo("");
  }

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (fStatus.length && !fStatus.includes(r.status)) return false;
      if (fCluster.length && !fCluster.includes(r.cluster)) return false;
      if (fState.length && !fState.includes(r.state)) return false;
      if (fOverdue !== "All") {
        const od = isOverdue(r);
        if (fOverdue === "Yes" ? !od : od) return false;
      }
      if (fDateFrom && (!r.dateSent || r.dateSent < fDateFrom)) return false;
      if (fDateTo && (!r.dateSent || r.dateSent > fDateTo)) return false;
      if (q) {
        const s = (r.description + r.requestedBy + r.location + r.id).toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => (b.dateSent || "").localeCompare(a.dateSent || ""));
  }, [rows, q, fStatus, fCluster, fState, fOverdue, fDateFrom, fDateTo]);

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h2 style={{ margin: 0, color: INK, fontSize: 20, letterSpacing: "var(--letter-spacing-tight)" }}>Admin</h2>
          <span style={{ color: MUTE, fontSize: 13 }}>
            {isAdmin ? "Update status and SLA classification — status changes here are final" : "Read-only — sign in as admin to make changes"}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {isAdmin ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: STATUS_META.Completed.fg, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: STATUS_META.Completed.dot }} />
              Signed in as Admin
            </span>
            <button type="button" onClick={onSignOut} style={{
              border: `1px solid ${LINE}`, background: SURFACE, color: MUTE, borderRadius: "var(--radius-sm)",
              padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>Sign out</button>
          </div>
        ) : (
          <AdminSignIn onSignIn={onSignIn} />
        )}
      </div>

      <div style={{ display: "flex", gap: 10, margin: "16px 0", flexWrap: "wrap", alignItems: "flex-end" }}>
        <FilterField label="Search">
          <input placeholder="Description, name, ref…" value={q} onChange={e => setQ(e.target.value)}
            style={{ ...inputStyle, width: 240 }} />
        </FilterField>
        <FilterField label="Status">
          <MultiSelectFilter options={STATUSES} selected={fStatus} onChange={setFStatus} width={150} />
        </FilterField>
        <FilterField label="Cluster">
          <MultiSelectFilter options={CLUSTERS} selected={fCluster} onChange={setFCluster} width={130} />
        </FilterField>
        <FilterField label="State">
          <MultiSelectFilter options={STATES} selected={fState} onChange={setFState} width={150} />
        </FilterField>
        <FilterField label="Overdue">
          <select style={{ ...inputStyle, width: "auto" }} value={fOverdue} onChange={e => setFOverdue(e.target.value)}>
            <option value="All">All</option>
            <option value="Yes">Overdue</option>
            <option value="No">Not overdue</option>
          </select>
        </FilterField>
        <FilterField label="Date sent">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" style={{ ...inputStyle, width: 145 }} value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
            <span style={{ color: MUTE, fontSize: 12 }}>–</span>
            <input type="date" style={{ ...inputStyle, width: 145 }} value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
          </div>
        </FilterField>
        <div style={{ flex: 1 }} />
        <span style={{ alignSelf: "center", fontSize: 12.5, color: MUTE, paddingBottom: 10 }}>{filtered.length} of {rows.length}</span>
        <button
          type="button"
          onClick={resetFilters}
          disabled={!filtersActive}
          style={{
            border: `1px solid ${LINE}`, background: SURFACE, color: filtersActive ? INK : MUTE, borderRadius: "var(--radius-sm)",
            padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: filtersActive ? "pointer" : "not-allowed",
            fontFamily: "inherit", opacity: filtersActive ? 1 : 0.5,
          }}
        >
          Reset filters
        </button>
        <button
          onClick={() => exportRowsToCSV(filtered, `psu-requests-${today()}.csv`)}
          disabled={filtered.length === 0}
          style={{
            border: `1px solid ${WHO}`, background: SURFACE, color: WHO_DARK, borderRadius: "var(--radius-sm)",
            padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: filtered.length ? "pointer" : "not-allowed",
            fontFamily: "inherit", opacity: filtered.length ? 1 : 0.5,
          }}
        >
          Export CSV{filtered.length < rows.length ? ` (${filtered.length} filtered)` : " (all)"}
        </button>
      </div>

      <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div className="admin-row" style={{ display: "grid", gridTemplateColumns: "88px 110px 1fr 130px 92px 130px", gap: 0, padding: "11px 16px", background: PAPER, fontSize: 11.5, fontWeight: 700, color: MUTE, textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wide)", borderBottom: `1px solid ${LINE}` }}>
          <div>Ref</div><div>State</div><div>Request</div><div>Requester</div><div>Cluster</div><div>Status</div>
        </div>
        <div style={{ maxHeight: 560, overflow: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: MUTE, fontSize: 13.5 }}>No requests match these filters.</div>
          )}
          {filtered.map(r => (
            <div key={r.id} onClick={() => setOpen(r.id)} className="admin-row" style={{
              display: "grid", gridTemplateColumns: "88px 110px 1fr 130px 92px 130px", gap: 0, alignItems: "center",
              padding: "12px 16px", borderBottom: `1px solid ${PAPER}`, cursor: "pointer", fontSize: 13,
              transition: `background var(--duration-fast) var(--easing-default)`,
            }} onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-hover)"} onMouseLeave={e => e.currentTarget.style.background = SURFACE}>
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTE, fontWeight: 500 }}>{r.id.slice(0, 8)}</div>
              <div style={{ fontSize: 12.5, color: MUTE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{r.state}</div>
              <div style={{ minWidth: 0, paddingRight: 12 }}>
                <div style={{ color: INK, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>
                <div style={{ fontSize: 11.5, color: MUTE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span className="admin-row-mobile-only" style={{ display: "none" }}>{r.requestedBy} · </span>
                  {r.location} · {r.dateSent || "—"}
                  {isOverdue(r) && <span style={{ color: DANGER, fontWeight: 700 }}> · overdue</span>}
                </div>
              </div>
              <div style={{ color: MUTE }}>{r.requestedBy}</div>
              <div style={{ color: MUTE }}>{r.cluster}</div>
              <div><StatusPill status={r.status} small /></div>
            </div>
          ))}
        </div>
      </div>

      {open && <DetailDrawer r={rows.find(x => x.id === open)} onClose={() => setOpen(null)} update={update} isAdmin={isAdmin} onSignIn={onSignIn} />}
    </Shell>
  );
}

function DetailDrawer({ r, onClose, update, isAdmin, onSignIn }) {
  const [status, setStatus] = useState(r.status);
  const [note, setNote] = useState("");
  const [expected, setExpected] = useState(r.expected || "");
  const [actual, setActual] = useState(r.actual || "");
  const [slaUnit, setSlaUnit] = useState(r.slaUnit || "");
  const [slaService, setSlaService] = useState(r.slaService || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const serviceOptions = slaUnit ? SLA_CATALOG[slaUnit] : [];
  const slaItem = slaUnit && slaService ? findSlaItem(slaUnit, slaService) : null;

  function chooseSlaUnit(u) {
    setSlaUnit(u);
    setSlaService("");
  }
  function chooseSlaService(desc) {
    setSlaService(desc);
    const item = findSlaItem(slaUnit, desc);
    const newExpected = item ? calcExpectedDate(r.dateSent, item.turnaround) : "";
    if (newExpected) setExpected(newExpected);
  }

  async function save() {
    if (!isAdmin || saving) return;
    const finalActual = status === "Completed" && !actual.trim() ? today() : actual;
    const hist = [...(r.history || [])];
    const changes = [];
    if (status !== r.status) changes.push(`Status → ${status}`);
    if (expected !== (r.expected || "")) changes.push("Expected date updated");
    if (finalActual !== (r.actual || "")) changes.push("Completion date set");
    if (slaUnit !== (r.slaUnit || "") || slaService !== (r.slaService || "")) changes.push("Support unit / service updated");
    if (note.trim()) changes.push(note.trim());
    if (changes.length) hist.push({ t: today(), by: "PSU Admin", note: changes.join(" · ") });
    setSaving(true);
    setSaveError("");
    const result = await update(r.id, {
      status, expected, actual: finalActual, history: hist,
      slaUnit, slaService, slaBusinessArea: slaItem ? slaItem.businessArea : "", slaTurnaround: slaItem ? slaItem.turnaround : "",
    });
    setSaving(false);
    if (result && result.error) {
      setSaveError(result.error);
      return;
    }
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--color-surface-overlay)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: "94vw", height: "100%", background: SURFACE, boxShadow: "var(--shadow-lg)", overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: SURFACE }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTE, fontWeight: 500, letterSpacing: "var(--letter-spacing-wide)" }}>{r.id}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}><StatusPill status={r.status} small /></div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: PAPER, borderRadius: "var(--radius-sm)", width: 32, height: 32, cursor: "pointer", fontSize: 17, color: MUTE }}>×</button>
        </div>

        <div style={{ padding: "20px 22px", flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: INK, lineHeight: 1.35, marginBottom: 14 }}>{r.description}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 18 }}>
            <Meta k="Requested by" v={r.requestedBy} />
            <Meta k="Cluster" v={r.cluster} />
            <Meta k="Location" v={r.location} />
            <Meta k="State / office" v={r.state} />
            <Meta k="Date sent" v={r.dateSent || "—"} />
            <Meta k="Overdue" v={isOverdue(r) ? "Yes" : "No"} />
            {!isAdmin && r.slaUnit && <Meta k="Support unit" v={r.slaUnit} />}
            {!isAdmin && r.slaTurnaround && <Meta k="SLA target" v={r.slaTurnaround} />}
            {!isAdmin && <Meta k="Expected completion" v={r.expected || "—"} />}
            {!isAdmin && <Meta k="Actual completion" v={r.actual || "—"} />}
          </div>
          {r.notes && (
            <div style={{ background: PAPER, borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: 20 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTE, marginBottom: 4, textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wide)" }}>Notes / latest update</div>
              <div style={{ fontSize: 13, color: INK, lineHeight: 1.5 }}>{r.notes}</div>
            </div>
          )}

          {isAdmin ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 12 }}>SLA classification</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 10 }}>
                <Field label="Support unit">
                  <select style={inputStyle} value={slaUnit} onChange={e => chooseSlaUnit(e.target.value)}>
                    <option value="">Select a unit…</option>
                    {SLA_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Service requested">
                  <select style={inputStyle} value={slaService} onChange={e => chooseSlaService(e.target.value)} disabled={!slaUnit}>
                    <option value="">{slaUnit ? "Select a service…" : "Pick a support unit first"}</option>
                    {serviceOptions.map((s, i) => <option key={i} value={s.description}>{s.businessArea} — {s.description}</option>)}
                  </select>
                </Field>
              </div>
              {slaItem && (
                <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700, color: INK }}>SLA target: {slaItem.turnaround}.</span>{" "}
                  <span style={{ color: MUTE }}>Selecting a service refreshes the expected-completion date below.</span>
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 12 }}>Update status</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
                {STATUSES.map(s => (
                  <button key={s} onClick={() => setStatus(s)} style={{
                    border: `1px solid ${status === s ? STATUS_META[s].dot : LINE}`,
                    background: status === s ? STATUS_META[s].bg : SURFACE,
                    color: status === s ? STATUS_META[s].fg : MUTE,
                    borderRadius: "var(--radius-sm)", padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    transition: `background var(--duration-fast) var(--easing-default), border-color var(--duration-fast) var(--easing-default)`,
                  }}>{STATUS_META[s].label}</button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <Field label="Expected completion" hint={slaItem ? "Auto-set from the SLA; adjust if needed." : undefined}><input type="date" style={inputStyle} value={expected} onChange={e => setExpected(e.target.value)} /></Field>
                <Field label="Actual completion" hint={status === "Completed" && !actual.trim() ? "Left blank — will default to today on save." : undefined}><input type="date" style={inputStyle} value={actual} onChange={e => setActual(e.target.value)} /></Field>
              </div>

              <Field label="Add an update note">
                <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Ticket INC4056065 raised with CSU Service Centre" />
              </Field>

              {saveError && <div style={{ fontSize: 12.5, color: DANGER, marginBottom: 10 }}>{saveError}</div>}
              <button onClick={save} disabled={saving} style={{ ...primaryBtn, width: "100%", marginBottom: 22, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: "var(--radius-md)", padding: "16px 18px", marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 6 }}>Sign in to make changes</div>
              <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 12, lineHeight: 1.5 }}>
                You're viewing this request read-only. Sign in as PSU Admin to update status, SLA classification, or completion dates.
              </div>
              <AdminSignIn onSignIn={onSignIn} compact />
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 10 }}>History</div>
          <div style={{ position: "relative", paddingLeft: 16 }}>
            <div style={{ position: "absolute", left: 4, top: 4, bottom: 4, width: 2, background: LINE }} />
            {[...(r.history || [])].reverse().map((h, i) => (
              <div key={i} style={{ position: "relative", marginBottom: 14 }}>
                <div style={{ position: "absolute", left: -16, top: 3, width: 8, height: 8, borderRadius: 4, background: i === 0 ? WHO : LINE }} />
                <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.4 }}>{h.note}</div>
                <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>{h.by} · {h.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function Meta({ k, v }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: MUTE, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wide)", marginBottom: 2 }}>{k}</div>
      <div style={{ fontSize: 13.5, color: INK, fontWeight: 500 }}>{v}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell + app root
// ---------------------------------------------------------------------------
function Shell({ children }) {
  return <div style={{ maxWidth: "var(--max-width-page)", margin: "0 auto", padding: "26px 22px 60px" }}>{children}</div>;
}

const primaryBtn = {
  border: "none", background: WHO, color: TEXT_INVERSE, borderRadius: "var(--radius-sm)", padding: "11px 20px",
  fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", letterSpacing: "var(--letter-spacing-normal)",
  transition: `background var(--duration-fast) var(--easing-default)`,
};

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("dash");
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [session, setSession] = useState(null);
  const isAdmin = !!session;

  // Initial load + auth session bootstrap.
  useEffect(() => {
    let cancelled = false;

    supabase.from("requests").select("*").order("date_sent", { ascending: false }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setLoadError(error.message);
      else setRows((data || []).map(rowToRecord));
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => { if (!cancelled) setSession(data.session); });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));

    return () => { cancelled = true; authSub.subscription.unsubscribe(); };
  }, []);

  // Live updates: keep the list in sync across tabs/admins.
  useEffect(() => {
    const channel = supabase
      .channel("requests-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, payload => {
        if (payload.eventType === "DELETE") {
          setRows(p => p.filter(r => r.id !== payload.old.id));
          return;
        }
        const rec = rowToRecord(payload.new);
        setRows(p => p.some(r => r.id === rec.id) ? p.map(r => r.id === rec.id ? rec : r) : [rec, ...p]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function create(rec) {
    const { data, error } = await supabase.from("requests").insert(recordToRow(rec)).select().single();
    if (error) return { error: error.message };
    const saved = rowToRecord(data);
    setRows(p => [saved, ...p]);
    return { ok: true };
  }

  async function update(id, patch) {
    const { data, error } = await supabase.from("requests").update(patchToRow(patch)).eq("id", id).select().single();
    if (error) return { error: error.message };
    const saved = rowToRecord(data);
    setRows(p => p.map(r => r.id === id ? saved : r));
    return { ok: true };
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { ok: true };
  }
  async function signOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-family-body)", color: "var(--color-text-secondary)" }}>
        Loading requests…
      </div>
    );
  }

  return (
    <div data-theme={dark ? "dark" : "light"} style={{
      minHeight: "100vh", background: "var(--color-bg-primary)", fontFamily: "var(--font-family-body)", color: INK,
      transition: `background-color var(--duration-normal) var(--easing-default), color var(--duration-normal) var(--easing-default)`,
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        * { -webkit-font-smoothing: antialiased; }
        select:focus, input:focus, textarea:focus, button:focus-visible {
          border-color: var(--color-border-focus) !important;
          box-shadow: var(--shadow-focus);
          outline: none;
        }
        @media (max-width: 860px){
          .submit-grid{ grid-template-columns:1fr !important; }
          .stat-grid{ grid-template-columns:repeat(2,1fr) !important; }
          .dash-grid{ grid-template-columns:1fr !important; }
        }
        @media (max-width: 640px){
          .topbar-row{ flex-wrap:wrap; row-gap:10px; }
          .topbar-subtitle{ display:none; }
          .topbar-nav{ order:3; width:100%; }
          .topbar-nav button{ flex:1; padding:8px 4px; font-size:12px; }
          .admin-row{ grid-template-columns:1fr 88px !important; }
          .admin-row > *:nth-child(1),
          .admin-row > *:nth-child(2),
          .admin-row > *:nth-child(4),
          .admin-row > *:nth-child(5){ display:none !important; }
          .admin-row-mobile-only{ display:inline !important; }
        }
      `}</style>
      <TopBar tab={tab} setTab={setTab} dark={dark} onToggleDark={() => setDark(d => !d)} />
      {loadError && (
        <div style={{ maxWidth: "var(--max-width-page)", margin: "12px auto 0", padding: "0 22px" }}>
          <div style={{ background: STATUS_META["On Hold"].bg, color: STATUS_META["On Hold"].fg, borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: 13 }}>
            Couldn't load requests: {loadError}
          </div>
        </div>
      )}
      {tab === "submit" && <SubmitView onCreate={create} />}
      {tab === "dash" && <DashView rows={rows} />}
      {tab === "admin" && <AdminView rows={rows} update={update} isAdmin={isAdmin} onSignIn={signIn} onSignOut={signOut} />}
    </div>
  );
}
