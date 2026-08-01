import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill in your project values.");
}

export const supabase = createClient(url, anonKey);

// DB rows use snake_case; the app's records use camelCase. These map
// between the two so the rest of the app never has to know the difference.
export function rowToRecord(row) {
  return {
    id: row.id,
    cluster: row.cluster,
    description: row.description,
    requestedBy: row.requested_by,
    location: row.location,
    state: row.state,
    dateSent: row.date_sent,
    status: row.status,
    expected: row.expected || "",
    actual: row.actual || "",
    slaUnit: row.sla_unit || "",
    slaService: row.sla_service || "",
    slaBusinessArea: row.sla_business_area || "",
    slaTurnaround: row.sla_turnaround || "",
    notes: row.notes || "",
    history: row.history || [],
  };
}

export function recordToRow(rec) {
  return {
    id: rec.id,
    cluster: rec.cluster,
    description: rec.description,
    requested_by: rec.requestedBy,
    location: rec.location,
    state: rec.state,
    date_sent: rec.dateSent,
    status: rec.status,
    expected: rec.expected || null,
    actual: rec.actual || null,
    sla_unit: rec.slaUnit || null,
    sla_service: rec.slaService || null,
    sla_business_area: rec.slaBusinessArea || null,
    sla_turnaround: rec.slaTurnaround || null,
    notes: rec.notes || "",
    history: rec.history || [],
  };
}

// Partial patch (for updates) — only include keys that were actually passed.
export function patchToRow(patch) {
  const map = {
    status: "status", expected: "expected", actual: "actual", history: "history",
    slaUnit: "sla_unit", slaService: "sla_service", slaBusinessArea: "sla_business_area", slaTurnaround: "sla_turnaround",
  };
  const row = {};
  for (const [key, col] of Object.entries(map)) {
    if (key in patch) row[col] = patch[key] === "" ? null : patch[key];
  }
  if ("history" in patch) row.history = patch.history;
  return row;
}
