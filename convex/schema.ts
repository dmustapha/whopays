import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,          // Convex Auth: users, authSessions, authAccounts, ... (owner identity)
  plans: defineTable({
    slug: v.string(),                    // url-safe id, e.g. "spotify-family-demo"
    name: v.string(),
    kind: v.union(v.literal("crawled"), v.literal("ownerEntered")),
    sourceUrl: v.optional(v.string()),   // crawled: required; ownerEntered: optional source link
    priceKobo: v.number(),               // current price (from latest snapshot or owner)
    currency: v.literal("NGN"),
    seatsTotal: v.number(),
    cycleMinutes: v.number(),            // REAL per-plan setting (demo=3, anchor=43200 ≈ monthly)
    isDemo: v.boolean(),
    demoLabel: v.optional(v.string()),   // "demo plan — replying PAID is the payment · cycles every 3 minutes"
    autoConfirm: v.boolean(),            // demo plan: matched → confirmed automatically (labeled)
    anchorReadOnly: v.boolean(),         // anchor plan: no public joins; owner-enrolled seats
    inboxId: v.string(),                 // AgentMail inbox for this plan
    lastCrawlAt: v.optional(v.number()),
    ownerUserId: v.optional(v.id("users")), // multi-tenant: the Convex Auth user who created+owns this plan
  }).index("by_slug", ["slug"]).index("by_owner", ["ownerUserId"]),

  seats: defineTable({
    planId: v.id("plans"),
    index: v.number(),
    state: v.union(v.literal("active_paid"), v.literal("active_unpaid"), v.literal("evicted"), v.literal("late_reported")),
    memberEmail: v.optional(v.string()), // NEVER projected by public queries (NN-4)
    displayLabel: v.string(),            // "Member A" | "Seat 3" | "owner-enrolled"
    ownerEnrolled: v.boolean(),
    joinedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
  }).index("by_plan", ["planId"]).index("by_plan_email", ["planId", "memberEmail"]).index("by_email", ["memberEmail"]),

  waitlist: defineTable({
    planId: v.id("plans"),
    email: v.string(),                   // NEVER projected publicly (NN-4)
    position: v.number(),
    joinedAt: v.number(),
  }).index("by_plan_position", ["planId", "position"]).index("by_plan_email", ["planId", "email"]),

  cycles: defineTable({
    planId: v.id("plans"),
    openedAt: v.number(),
    deadline: v.number(),
    state: v.union(v.literal("open"), v.literal("closed")),
    duesKobo: v.number(),
    nagSent: v.boolean(),
  }).index("by_plan_state", ["planId", "state"]).index("by_state_deadline", ["state", "deadline"]),

  payments: defineTable({
    planId: v.id("plans"),
    seatId: v.id("seats"),
    cycleId: v.id("cycles"),
    source: v.union(v.literal("reply"), v.literal("bank_alert"), v.literal("owner")),
    status: v.union(v.literal("matched"), v.literal("confirmed"), v.literal("mismatch"), v.literal("pending_parse")),
    amountKobo: v.optional(v.number()),
    messageId: v.optional(v.string()),
    at: v.number(),
  }).index("by_plan", ["planId"]).index("by_seat", ["seatId"]),

  priceSnapshots: defineTable({
    planId: v.id("plans"),
    priceKobo: v.number(),
    sourceUrl: v.string(),
    scrapedAt: v.number(),
    title: v.optional(v.string()),
    statusCode: v.optional(v.number()),
    creditsUsed: v.optional(v.number()),
    changed: v.boolean(),
    origin: v.union(v.literal("crawl"), v.literal("owner_update")),
  }).index("by_plan_time", ["planId", "scrapedAt"]),

  events: defineTable({                  // append-only, PII-free (publicText law)
    planId: v.optional(v.id("plans")),
    at: v.number(),
    type: v.string(),                    // EventType from lib/shared.ts
    publicText: v.string(),              // rendered verbatim — must never contain an email address
    code: v.optional(v.string()),        // CODES.* token when applicable (RACE_REFUSED etc.)
  }).index("by_plan_time", ["planId", "at"]).index("by_time", ["at"]),

  emailLog: defineTable({
    planId: v.optional(v.id("plans")),
    direction: v.union(v.literal("out"), v.literal("in")),
    kind: v.string(),                    // SendKind | "reply" | "unknown"
    counterpartyRedacted: v.string(),    // "[redacted inbox]" always (log-format rule)
    subject: v.string(),
    bodyText: v.string(),                // rendered in the ledger UI; addresses pre-redacted
    at: v.number(),
    status: v.optional(v.string()),      // outbound component status snapshot
    outboundId: v.optional(v.string()),
  }).index("by_plan_time", ["planId", "at"]).index("by_time", ["at"]),

  sendBudget: defineTable({
    day: v.string(),                     // YYYY-MM-DD UTC
    sent: v.number(),
    suppressedNonCritical: v.boolean(),
  }).index("by_day", ["day"]),

  joinRates: defineTable({               // per-address daily join throttle
    day: v.string(),
    email: v.string(),
    count: v.number(),
  }).index("by_day_email", ["day", "email"]),

  unrecognized: defineTable({            // E3: never silently dropped
    planId: v.optional(v.id("plans")),
    fromRedacted: v.string(),            // "[redacted inbox]"
    receivedAt: v.number(),
    topText: v.string(),
    messageId: v.string(),
    inboxId: v.string(),
    resolved: v.boolean(),
  }).index("by_resolved", ["resolved"]),

  threadMap: defineTable({               // outbound thread -> plan/seat (thread-first reply routing)
    threadId: v.string(),
    planId: v.id("plans"),
    seatId: v.optional(v.id("seats")),
  }).index("by_thread", ["threadId"]),

  processedMessages: defineTable({       // inbound idempotency (webhook + poll share it)
    messageId: v.string(),
    at: v.number(),
  }).index("by_messageId", ["messageId"]),

  ownerSessions: defineTable({           // D-3: simple owner session
    token: v.string(),
    createdAt: v.number(),
  }).index("by_token", ["token"]),
});
