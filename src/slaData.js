import raw from "./sla_catalog.json";

// SLA_CATALOG: { [unitName]: [{ businessArea, description, clients, turnaround, remarks }] }
export const SLA_CATALOG = raw;
export const SLA_UNITS = Object.keys(SLA_CATALOG);

// Patterns whose turnaround counts down to a future event/expiry/activity date
// rather than counting forward from the date the request was sent — these
// cannot be computed without an event date the Submit form doesn't collect.
const NON_COMPUTABLE = [
  /\bbefore\b/,
  /\bmonthly\b/, /\bquarterly\b/, /\bweekly\b/, /\bregularly\b/,
  /\bevent days\b/, /subject to/, /reporting to duty/, /states reviewed/,
  /of the month/, /every month/, /^\d{1,2}(st|nd|rd|th)?\s*[–-]\s*\d{1,2}/,
];

// Parses a turnaround string into a computable day offset, or flags it as
// non-computable (anchored to an external date, not the request date).
export function parseTurnaround(text) {
  if (!text) return { computable: false };
  const t = String(text).toLowerCase();
  if (NON_COMPUTABLE.some(re => re.test(t))) return { computable: false };

  let m;
  if ((m = t.match(/(\d+)\s*working day/))) {
    return { computable: true, days: parseInt(m[1], 10), businessDays: true };
  }
  if ((m = t.match(/(\d+)\s*hour/))) {
    const hours = parseInt(m[1], 10);
    return { computable: true, days: hours <= 8 ? 0 : Math.ceil(hours / 24), businessDays: true };
  }
  if ((m = t.match(/(\d+)\s*week/))) {
    return { computable: true, days: parseInt(m[1], 10) * 7, businessDays: false };
  }
  if ((m = t.match(/(\d+)\s*month/))) {
    return { computable: true, days: parseInt(m[1], 10) * 30, businessDays: false };
  }
  if ((m = t.match(/(\d+)\s*day/))) {
    return { computable: true, days: parseInt(m[1], 10), businessDays: false };
  }
  return { computable: false };
}

function addCalendarDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function addBusinessDays(date, n) {
  const d = new Date(date);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

// Computes the expected-by date (YYYY-MM-DD) for a request sent on
// dateSentISO, per the matching SLA's turnaround time. Returns "" when the
// turnaround isn't a fixed offset from the request date (e.g. "6 weeks
// before event start date", "Quarterly") — those need a PSU admin judgment
// call instead of an auto-computed date.
export function calcExpectedDate(dateSentISO, turnaroundText) {
  const p = parseTurnaround(turnaroundText);
  if (!p.computable) return "";
  const base = dateSentISO ? new Date(dateSentISO) : new Date();
  const d = p.days === 0 ? base : (p.businessDays ? addBusinessDays(base, p.days) : addCalendarDays(base, p.days));
  return d.toISOString().slice(0, 10);
}

export function findSlaItem(unit, description) {
  const items = SLA_CATALOG[unit];
  if (!items) return null;
  return items.find(i => i.description === description) || null;
}
