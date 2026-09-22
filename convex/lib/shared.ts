// Deterministic core. Imports NOTHING outside this directory (dependency-flow law).

export const CODES = {
  DEMO_SEATS_JOIN_ONLY: "DEMO_SEATS_JOIN_ONLY",
  ANCHOR_READ_ONLY: "ANCHOR_READ_ONLY",
  RACE_REFUSED: "RACE_REFUSED",
  NO_SNAPSHOT: "NO_SNAPSHOT",
  PII_PROJECTION_VIOLATION: "PII_PROJECTION_VIOLATION",
  BUDGET_SUPPRESSED: "BUDGET_SUPPRESSED",
  BUDGET_EXHAUSTED: "BUDGET_EXHAUSTED",
  JOIN_RATE_LIMITED: "JOIN_RATE_LIMITED",
  ALREADY_ON_PLAN: "ALREADY_ON_PLAN",
  OWNER_ONLY: "OWNER_ONLY",
  NOT_OWNER_ENTERED: "NOT_OWNER_ENTERED",
  PRICE_OUT_OF_RANGE: "PRICE_OUT_OF_RANGE",
} as const;

export const LIMITS = {
  DAILY_SEND_CAP: 100,          // AgentMail free tier hard cap
  SOFT_SUPPRESS_AT: 80,         // non-critical sends suppressed from here
  JOINS_PER_ADDRESS_PER_DAY: 2,
  PRICE_MIN_KOBO: 500_00,       // ₦500
  PRICE_MAX_KOBO: 50_000_00,    // ₦50,000
  // Demo-plan liveness is ACTIVITY-GATED (peer-review finding: unconditional 3-min cycles
  // with seated members would burn the daily cap in ~1h). A judge's join wakes the board;
  // an idle board pauses between cycles. Max wait for an ACTIVE judge is still one cycle (~3 min).
  DEMO_ACTIVITY_WINDOW_MS: 30 * 60_000, // demo cycles run only if a join/reply happened within 30 min
  DEMO_EMAIL_FRESHNESS_MS: 60 * 60_000, // demo-plan emails go only to seats active within 60 min
  CYCLE_ADMISSION_RESERVE: 10,          // never open a cycle whose projected sends would leave <10 headroom
} as const;

// Send kinds. "critical" kinds still send in the 80–100 window.
export const SEND_KINDS = {
  dues: { critical: true },
  eviction: { critical: true },
  promotion: { critical: true },
  ack: { critical: true },      // joiner's only feedback channel — critical
  nag: { critical: false },
  price_changed: { critical: false },
} as const;
export type SendKind = keyof typeof SEND_KINDS;

export type PaymentStatus = "matched" | "confirmed" | "mismatch" | "pending_parse"; // closed set — NN-2: no stronger status exists
export type SeatState = "active_paid" | "active_unpaid" | "evicted" | "late_reported";
export type PlanKind = "crawled" | "ownerEntered";
export type EventType =
  | "join" | "evict" | "promote" | "dues_sent" | "paid_matched" | "paid_confirmed"
  | "price_changed" | "race_refused" | "reinstated" | "late_reported" | "cycle_opened"
  | "budget_suppressed" | "unrecognized_reply";

export function formatNaira(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  return "₦" + naira.toLocaleString("en-NG");
}

export function duesPerSeat(priceKobo: number, seatsTotal: number): number {
  // ceil so the owner never under-collects by rounding
  return Math.ceil(priceKobo / seatsTotal);
}

export function seatLabel(index: number): string {
  return `Seat ${index + 1}`;
}

// Anonymous public label for a joined member (NN-4: emails never leave the server).
// "j***@g…" style is still PII-adjacent; we use position-based labels only.
export function memberLabel(seatIndex: number): string {
  return `Member ${String.fromCharCode(65 + (seatIndex % 26))}`; // Member A, B, C…
}

// NN-4 active guard: public query payloads are asserted address-free before leaving the server.
const ADDRESS_SHAPE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
export function assertNoPii<T>(payload: T): T {
  if (ADDRESS_SHAPE.test(JSON.stringify(payload))) throw new Error(CODES.PII_PROJECTION_VIOLATION);
  return payload;
}

// Write-time redaction for any text a stranger typed (inbound bodies may contain addresses;
// assertNoPii would rightly refuse to serve them — so they never reach the DB unredacted).
export function redactAddresses(s: string): string {
  return s.replace(new RegExp(ADDRESS_SHAPE, "g"), "[redacted inbox]");
}

// DH-6 tenant-safety guard. Inbound emailLog rows are written by the webhook BEFORE routing,
// so they never carry a planId — the public Landing ledger therefore cannot attribute them to
// a showcase (demo/anchor) plan. Rendering their body publicly leaks a private tenant's reply
// content (addresses are redacted, but plan/personal context is not). This projection masks the
// body/subject of ANY inbound row the public surface can't prove belongs to a showcase plan,
// while still signalling the rail is bidirectional (kind/timestamp/redacted peer). Outbound
// rows always carry a planId (enqueueSend) and are scoped by the caller before this.
export type PublicLedgerRow = {
  at: number; direction: "in" | "out"; kind: string;
  subject: string; bodyText: string; counterparty: string; status: string | null;
};
export function publicLedgerRow(
  row: { at: number; direction: "in" | "out"; kind: string; subject: string;
         bodyText: string; counterpartyRedacted: string; status?: string | null;
         planId?: string | null },
  isShowcase: (planId: string | null | undefined) => boolean,
): PublicLedgerRow {
  const base = { at: row.at, direction: row.direction, kind: row.kind,
    counterparty: row.counterpartyRedacted, status: row.status ?? null };
  const attributable = row.planId != null && isShowcase(row.planId);
  if (row.direction === "in" && !attributable) {
    // Not provably a showcase reply → never expose tenant-typed content publicly.
    return { ...base, subject: "(reply received)", bodyText: "(reply content is visible to the plan owner)" };
  }
  return { ...base, subject: row.subject, bodyText: row.bodyText };
}

export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  // Pragmatic RFC-lite check; server-side only.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 254) return null;
  return e;
}

// Naira amount normalizer (C5 edge: ₦/NGN/naira variants). Pure; unit-tested.
export function parseNairaToKobo(text: string): number | null {
  const m = text.replace(/,/g, "").match(/(?:₦|ngn|naira)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!m) return null;
  const kobo = Math.round(parseFloat(m[1]) * 100);
  return Number.isFinite(kobo) && kobo > 0 ? kobo : null;
}
