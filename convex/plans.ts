import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { CODES, LIMITS, assertNoPii, duesPerSeat, formatNaira, seatLabel } from "./lib/shared";

// ---------- helpers (module-private) ----------
async function requireOwner(ctx: any, token: string) {
  const s = await ctx.db.query("ownerSessions").withIndex("by_token", (q: any) => q.eq("token", token)).unique();
  if (!s) throw new Error(CODES.OWNER_ONLY);
}

// PII allowlist projection (NN-4). Every public read builds seats through this.
function projectSeat(seat: any) {
  return {
    _id: seat._id, index: seat.index, state: seat.state,
    displayLabel: seat.displayLabel, ownerEnrolled: seat.ownerEnrolled,
    joinedAt: seat.joinedAt ?? null, paidAt: seat.paidAt ?? null,
  };
}

// ---------- public queries ----------
export const listPlans = query({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect();
    return assertNoPii(plans.map((p) => ({
      _id: p._id, slug: p.slug, name: p.name, kind: p.kind, isDemo: p.isDemo,
      demoLabel: p.demoLabel ?? null, anchorReadOnly: p.anchorReadOnly,
      priceKobo: p.priceKobo, seatsTotal: p.seatsTotal, cycleMinutes: p.cycleMinutes,
      sourceUrl: p.sourceUrl ?? null, lastCrawlAt: p.lastCrawlAt ?? null,
    })));
  },
});

export const getBoard = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const plan = await ctx.db.query("plans").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (!plan) return null;
    const seats = await ctx.db.query("seats").withIndex("by_plan", (q) => q.eq("planId", plan._id)).collect();
    const wl = await ctx.db.query("waitlist").withIndex("by_plan_position", (q) => q.eq("planId", plan._id)).collect();
    const cycle = await ctx.db.query("cycles")
      .withIndex("by_plan_state", (q) => q.eq("planId", plan._id).eq("state", "open")).unique();
    const snaps = await ctx.db.query("priceSnapshots")
      .withIndex("by_plan_time", (q) => q.eq("planId", plan._id)).order("desc").take(1);
    const snapshot = snaps[0] ?? null;
    return assertNoPii({
      plan: {
        _id: plan._id, slug: plan.slug, name: plan.name, kind: plan.kind,
        isDemo: plan.isDemo, demoLabel: plan.demoLabel ?? null, autoConfirm: plan.autoConfirm,
        anchorReadOnly: plan.anchorReadOnly, seatsTotal: plan.seatsTotal,
        cycleMinutes: plan.cycleMinutes, sourceUrl: plan.sourceUrl ?? null,
      },
      seats: seats.sort((a, b) => a.index - b.index).map(projectSeat),
      waitlistCount: wl.length,
      cycle: cycle ? { deadline: cycle.deadline, duesKobo: cycle.duesKobo, openedAt: cycle.openedAt } : null,
      snapshot: snapshot
        ? { priceKobo: snapshot.priceKobo, priceDisplay: formatNaira(snapshot.priceKobo),
            sourceUrl: snapshot.sourceUrl, scrapedAt: snapshot.scrapedAt, origin: snapshot.origin }
        : { code: CODES.NO_SNAPSHOT }, // NN-3: no number without provenance
      duesDisplay: cycle ? formatNaira(cycle.duesKobo) : null,
    });
  },
});

export const getEventLog = query({
  args: { slug: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    if (args.slug) {
      const plan = await ctx.db.query("plans").withIndex("by_slug", (q) => q.eq("slug", args.slug!)).unique();
      if (!plan) return [];
      const rows = await ctx.db.query("events")
        .withIndex("by_plan_time", (q) => q.eq("planId", plan._id)).order("desc").take(limit);
      return assertNoPii(rows.map((e) => ({ at: e.at, type: e.type, publicText: e.publicText, code: e.code ?? null })));
    }
    const rows = await ctx.db.query("events").withIndex("by_time").order("desc").take(limit);
    return assertNoPii(rows.map((e) => ({ at: e.at, type: e.type, publicText: e.publicText, code: e.code ?? null })));
  },
});

export const getEmailLedger = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("emailLog").withIndex("by_time").order("desc").take(Math.min(args.limit ?? 30, 100));
    return assertNoPii(rows.map((r) => ({
      at: r.at, direction: r.direction, kind: r.kind, subject: r.subject,
      bodyText: r.bodyText, counterparty: r.counterpartyRedacted, status: r.status ?? null,
    })));
  },
});

export const getSendBudget = query({
  args: {},
  handler: async (ctx) => {
    const day = new Date().toISOString().slice(0, 10);
    const row = await ctx.db.query("sendBudget").withIndex("by_day", (q) => q.eq("day", day)).unique();
    return { day, sent: row?.sent ?? 0, cap: LIMITS.DAILY_SEND_CAP,
             softAt: LIMITS.SOFT_SUPPRESS_AT, suppressing: row?.suppressedNonCritical ?? false };
  },
});

// ---------- owner mutations ----------
export const createPlan = mutation({
  args: {
    ownerToken: v.string(), slug: v.string(), name: v.string(),
    kind: v.union(v.literal("crawled"), v.literal("ownerEntered")),
    sourceUrl: v.optional(v.string()), priceKobo: v.number(), seatsTotal: v.number(),
    cycleMinutes: v.number(), isDemo: v.boolean(), demoLabel: v.optional(v.string()),
    autoConfirm: v.boolean(), anchorReadOnly: v.boolean(), inboxId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.ownerToken);
    if (args.priceKobo < LIMITS.PRICE_MIN_KOBO || args.priceKobo > LIMITS.PRICE_MAX_KOBO)
      throw new Error(CODES.PRICE_OUT_OF_RANGE);
    const existing = await ctx.db.query("plans").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (existing) return existing._id; // idempotent for seed-demo
    const { ownerToken, ...plan } = args;
    const planId = await ctx.db.insert("plans", { ...plan, currency: "NGN" as const });
    for (let i = 0; i < args.seatsTotal; i++) {
      await ctx.db.insert("seats", {
        planId, index: i, state: "active_unpaid",
        displayLabel: seatLabel(i), ownerEnrolled: false,
      });
    }
    if (args.kind === "ownerEntered") {
      // FINDING-14: owner-entered plans carry provenance from birth (origin: owner_update),
      // so the anchor board never shows "price pending crawl" for a plan that will never crawl.
      await ctx.db.insert("priceSnapshots", {
        planId, priceKobo: args.priceKobo, sourceUrl: args.sourceUrl ?? "owner-entered",
        scrapedAt: Date.now(), changed: false, origin: "owner_update",
      });
    }
    await ctx.db.insert("events", { planId, at: Date.now(), type: "cycle_opened",
      publicText: `Plan "${args.name}" created (${args.seatsTotal} seats)` });
    await ctx.scheduler.runAfter(0, internal.cycles.openCycle, { planId });
    return planId;
  },
});

export const updateOwnerPrice = mutation({
  args: { ownerToken: v.string(), planId: v.id("plans"), priceKobo: v.number() },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.ownerToken);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("plan not found");
    if (plan.kind !== "ownerEntered") throw new Error(CODES.NOT_OWNER_ENTERED); // crawled plans change only via crawl (NN-3)
    if (args.priceKobo < LIMITS.PRICE_MIN_KOBO || args.priceKobo > LIMITS.PRICE_MAX_KOBO)
      throw new Error(CODES.PRICE_OUT_OF_RANGE);
    const old = plan.priceKobo;
    await ctx.db.patch(args.planId, { priceKobo: args.priceKobo });
    await ctx.db.insert("priceSnapshots", {
      planId: args.planId, priceKobo: args.priceKobo, sourceUrl: plan.sourceUrl ?? "owner-entered",
      scrapedAt: Date.now(), changed: old !== args.priceKobo, origin: "owner_update",
    });
    if (old !== args.priceKobo) {
      const cycle = await ctx.db.query("cycles")
        .withIndex("by_plan_state", (q) => q.eq("planId", args.planId).eq("state", "open")).unique();
      if (cycle) await ctx.db.patch(cycle._id, { duesKobo: duesPerSeat(args.priceKobo, plan.seatsTotal) });
      await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "price_changed",
        publicText: `Price changed (owner-updated): ${formatNaira(old)} → ${formatNaira(args.priceKobo)} — dues recomputed` });
    }
    return { old, next: args.priceKobo };
  },
});

// E3 surface: the owner's unrecognized-reply queue (PRD F5.5/F6.3) — token-gated, write-time-redacted.
export const getUnrecognized = query({
  args: { ownerToken: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db.query("ownerSessions").withIndex("by_token", (q) => q.eq("token", args.ownerToken)).unique();
    if (!s) throw new Error(CODES.OWNER_ONLY);
    const rows = await ctx.db.query("unrecognized")
      .withIndex("by_resolved", (q) => q.eq("resolved", false)).take(50);
    return rows.map((r) => ({ _id: r._id, receivedAt: r.receivedAt, topText: r.topText }));
  },
});

export const ownerLogin = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.OWNER_SECRET) throw new Error(CODES.OWNER_ONLY);
    const token = crypto.randomUUID();
    await ctx.db.insert("ownerSessions", { token, createdAt: Date.now() });
    return { token };
  },
});
