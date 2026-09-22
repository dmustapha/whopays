import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { CODES, LIMITS, assertNoPii, duesPerSeat, formatNaira, seatLabel, publicLedgerRow } from "./lib/shared";

// ---------- helpers (module-private) ----------
// Multi-tenant owner gate: the caller must be authenticated AND own this plan.
// (Members are email-only and never hit this path.)
async function requirePlanOwner(ctx: any, planId: any) {
  const uid = await getAuthUserId(ctx);
  if (!uid) throw new Error(CODES.OWNER_ONLY);
  const plan = await ctx.db.get(planId);
  if (!plan) throw new Error("plan not found");
  if (plan.ownerUserId !== uid) throw new Error(CODES.OWNER_ONLY); // per-plan IDOR boundary
  return { uid, plan };
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
// PUBLIC showcase listing for the landing page — ONLY demo/anchor plans, never a
// user's private plans (multi-tenant privacy: don't enumerate other creators' plans).
export const listPlans = query({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect();
    const showcase = plans.filter((p) => p.isDemo || p.anchorReadOnly);
    return assertNoPii(showcase.map((p) => ({
      _id: p._id, slug: p.slug, name: p.name, kind: p.kind, isDemo: p.isDemo,
      demoLabel: p.demoLabel ?? null, anchorReadOnly: p.anchorReadOnly,
      priceKobo: p.priceKobo, seatsTotal: p.seatsTotal, cycleMinutes: p.cycleMinutes,
      sourceUrl: p.sourceUrl ?? null, lastCrawlAt: p.lastCrawlAt ?? null,
    })));
  },
});

// OWNER action queue — seats across the caller's plans that need attention
// (owing seats to confirm, late-reported seats to reinstate).
export const ownerQueue = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    const plans = await ctx.db.query("plans").withIndex("by_owner", (q) => q.eq("ownerUserId", uid)).collect();
    const out: any[] = [];
    for (const plan of plans) {
      if (plan.isDemo) continue; // demo auto-confirms; nothing for the owner to do
      const seats = await ctx.db.query("seats").withIndex("by_plan", (q) => q.eq("planId", plan._id)).collect();
      for (const s of seats) {
        const occupied = s.joinedAt != null || s.ownerEnrolled;
        if (s.state === "late_reported" || (s.state === "active_unpaid" && occupied)) {
          out.push({ seatId: s._id, planName: plan.name, slug: plan.slug, label: s.displayLabel, state: s.state });
        }
      }
    }
    return out.slice(0, 50);
  },
});

// OWNER listing — the signed-in creator's own plans (owner console).
export const myPlans = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    const plans = await ctx.db.query("plans").withIndex("by_owner", (q) => q.eq("ownerUserId", uid)).collect();
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

// Multi-tenant privacy: the global (no-slug) branch is a PUBLIC surface (Landing).
// It must expose ONLY the showcase (demo/anchor) plans — never another creator's
// private plan activity. Per-plan events stay public by slug (boards are shareable links).
async function showcasePlanIds(ctx: any): Promise<Set<string>> {
  const plans = await ctx.db.query("plans").collect();
  return new Set(plans.filter((p: any) => p.isDemo || p.anchorReadOnly).map((p: any) => p._id));
}

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
    // GLOBAL branch (public Landing) — showcase plans only + un-scoped system rows (planId null).
    const showcase = await showcasePlanIds(ctx);
    const rows = await ctx.db.query("events").withIndex("by_time").order("desc").take(limit * 2);
    return assertNoPii(rows
      .filter((e) => e.planId == null || showcase.has(e.planId))
      .slice(0, limit)
      .map((e) => ({ at: e.at, type: e.type, publicText: e.publicText, code: e.code ?? null })));
  },
});

export const getEmailLedger = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // PUBLIC surface (Landing). Show showcase-plan outbound + address-redacted inbound/system
    // rows (planId null); NEVER another creator's private-plan email (subject leaks plan name).
    const showcase = await showcasePlanIds(ctx);
    const limit = Math.min(args.limit ?? 30, 100);
    const rows = await ctx.db.query("emailLog").withIndex("by_time").order("desc").take(limit * 3);
    return assertNoPii(rows
      .filter((r) => r.planId == null || showcase.has(r.planId))
      .slice(0, limit)
      // DH-6: mask inbound bodies not provably attributable to a showcase plan (tenant safety).
      .map((r) => publicLedgerRow(r, (id: any) => id != null && showcase.has(id))));
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
// Shared plan-birth logic (used by the public createPlan and the internal seed).
async function birthPlan(ctx: any, plan: any) {
  if (plan.priceKobo < LIMITS.PRICE_MIN_KOBO || plan.priceKobo > LIMITS.PRICE_MAX_KOBO)
    throw new Error(CODES.PRICE_OUT_OF_RANGE);
  const planId = await ctx.db.insert("plans", { ...plan, currency: "NGN" as const });
  for (let i = 0; i < plan.seatsTotal; i++) {
    await ctx.db.insert("seats", {
      planId, index: i, state: "active_unpaid",
      displayLabel: seatLabel(i), ownerEnrolled: false,
    });
  }
  if (plan.kind === "ownerEntered") {
    // FINDING-14: owner-entered plans carry provenance from birth (origin: owner_update).
    await ctx.db.insert("priceSnapshots", {
      planId, priceKobo: plan.priceKobo, sourceUrl: plan.sourceUrl ?? "owner-entered",
      scrapedAt: Date.now(), changed: false, origin: "owner_update",
    });
  }
  await ctx.db.insert("events", { planId, at: Date.now(), type: "cycle_opened",
    publicText: `Plan "${plan.name}" created (${plan.seatsTotal} seats)` });
  await ctx.scheduler.runAfter(0, internal.cycles.openCycle, { planId });
  return planId;
}

// PUBLIC create — any signed-in user creates a plan they own (multi-tenant genesis).
// isDemo/autoConfirm are system-only flags (forced off here); the demo showcase is seeded.
export const createPlan = mutation({
  args: {
    slug: v.string(), name: v.string(),
    kind: v.union(v.literal("crawled"), v.literal("ownerEntered")),
    sourceUrl: v.optional(v.string()), priceKobo: v.number(), seatsTotal: v.number(),
    cycleMinutes: v.number(), anchorReadOnly: v.boolean(), inboxId: v.string(),
  },
  handler: async (ctx, args) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) throw new Error(CODES.OWNER_ONLY); // must be signed in to create/own a plan
    // slug must be globally unique (it's the public board URL). If taken, suffix it.
    let slug = args.slug || "plan";
    const clash = await ctx.db.query("plans").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    // DH-8 hardening: anchorReadOnly and inboxId are SYSTEM-ONLY (seedCreatePlan sets them).
    // A public caller passing anchorReadOnly:true would inject their private plan into the
    // public showcase (Landing filter = isDemo||anchorReadOnly) and unlock owner-enroll of
    // arbitrary emails; a spoofed inboxId would join their plan into another tenant's inbound
    // routing scope (inbox-spoof seam). Both are forced to the safe default here — the client
    // args stay in the signature for backward compat but are ignored (legit callers already
    // send false/"": OwnerConsole.tsx:193, e2e-multitenant.ts:28).
    return await birthPlan(ctx, {
      slug, name: args.name, kind: args.kind, sourceUrl: args.sourceUrl,
      priceKobo: args.priceKobo, seatsTotal: args.seatsTotal, cycleMinutes: args.cycleMinutes,
      isDemo: false, demoLabel: undefined, autoConfirm: false,
      anchorReadOnly: false, inboxId: "", ownerUserId: uid,
    });
  },
});

// SEED-ONLY — creates the demo/anchor showcase plans under a system owner account.
// Gated by OWNER_SECRET (deployment env) so it can't be called by the public.
export const seedCreatePlan = mutation({
  args: {
    secret: v.string(), ownerUserId: v.id("users"), slug: v.string(), name: v.string(),
    kind: v.union(v.literal("crawled"), v.literal("ownerEntered")),
    sourceUrl: v.optional(v.string()), priceKobo: v.number(), seatsTotal: v.number(),
    cycleMinutes: v.number(), isDemo: v.boolean(), demoLabel: v.optional(v.string()),
    autoConfirm: v.boolean(), anchorReadOnly: v.boolean(), inboxId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.OWNER_SECRET) throw new Error(CODES.OWNER_ONLY);
    const existing = await ctx.db.query("plans").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (existing) {
      // idempotent re-seed + migrate pre-auth plans to the system owner.
      if (existing.ownerUserId !== args.ownerUserId) await ctx.db.patch(existing._id, { ownerUserId: args.ownerUserId });
      // migrate cosmetic showcase fields on re-seed (name/demoLabel) so a seed edit takes effect
      // without a destructive re-create; structural flags (isDemo/autoConfirm/anchorReadOnly) unchanged.
      if (existing.name !== args.name || existing.demoLabel !== args.demoLabel)
        await ctx.db.patch(existing._id, { name: args.name, demoLabel: args.demoLabel });
      return existing._id;
    }
    const { secret, ...plan } = args;
    return await birthPlan(ctx, plan);
  },
});

// Admin repoint (OWNER_SECRET-gated): set a seeded plan's pinned inbox. Empty string ""
// makes the plan fall back to AGENTMAIL_INBOX_ID (the canonical default-inbox path).
export const adminSetInbox = mutation({
  args: { secret: v.string(), slug: v.string(), inboxId: v.string() },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.OWNER_SECRET) throw new Error(CODES.OWNER_ONLY);
    const plan = await ctx.db.query("plans").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (!plan) throw new Error("plan not found");
    await ctx.db.patch(plan._id, { inboxId: args.inboxId });
    return { slug: args.slug, inboxId: args.inboxId };
  },
});

// Admin reset (OWNER_SECRET-gated): restore a plan's board to the pristine seeded-empty
// state — every non-owner seat back to empty, waitlist cleared. For demo staging only.
export const adminResetBoard = mutation({
  args: { secret: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.OWNER_SECRET) throw new Error(CODES.OWNER_ONLY);
    const plan = await ctx.db.query("plans").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (!plan) throw new Error("plan not found");
    const seats = await ctx.db.query("seats").withIndex("by_plan", (q) => q.eq("planId", plan._id)).collect();
    let cleared = 0;
    for (const s of seats) {
      if (s.ownerEnrolled) continue;
      await ctx.db.patch(s._id, {
        state: "active_unpaid", displayLabel: seatLabel(s.index),
        memberEmail: undefined, joinedAt: undefined, paidAt: undefined,
      });
      cleared++;
    }
    const wl = await ctx.db.query("waitlist").withIndex("by_plan_position", (q) => q.eq("planId", plan._id)).collect();
    for (const w of wl) await ctx.db.delete(w._id);
    return { slug: args.slug, seatsCleared: cleared, waitlistCleared: wl.length };
  },
});

export const updateOwnerPrice = mutation({
  args: { planId: v.id("plans"), priceKobo: v.number() },
  handler: async (ctx, args) => {
    const { plan } = await requirePlanOwner(ctx, args.planId);
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

// E3 surface: the owner's unrecognized-reply queue (PRD F5.5/F6.3) — auth-gated,
// scoped to the caller's own plans, write-time-redacted.
export const getUnrecognized = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) throw new Error(CODES.OWNER_ONLY);
    const mine = await ctx.db.query("plans").withIndex("by_owner", (q) => q.eq("ownerUserId", uid)).collect();
    // Unrecognized replies can't be attributed to a plan (no seat matched), but they DO carry the
    // inbox they arrived at. Scope by the caller's owned inboxes, normalizing "" to the env default
    // exactly as the send rail does (emailRail.enqueueSend) so env-default plans still match.
    const defaultInbox = process.env.AGENTMAIL_INBOX_ID ?? "";
    const myInboxes = new Set(mine.map((p) => (p.inboxId && p.inboxId !== "" ? p.inboxId : defaultInbox)));
    const rows = await ctx.db.query("unrecognized")
      .withIndex("by_resolved", (q) => q.eq("resolved", false)).take(200);
    return rows
      .filter((r) => myInboxes.has(r.inboxId))
      .slice(0, 50)
      .map((r) => ({ _id: r._id, receivedAt: r.receivedAt, topText: r.topText }));
  },
});
