import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { LIMITS, duesPerSeat, formatNaira } from "./lib/shared";

// Multi-tenant ownership check for owner-gated actions (prices crawl).
export const userOwnsPlan = internalQuery({
  args: { userId: v.id("users"), planId: v.id("plans") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.planId);
    return p != null && p.ownerUserId === args.userId;
  },
});

export const getPlanForCrawl = internalQuery({
  args: { planId: v.id("plans") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.planId);
    return p ? { _id: p._id, kind: p.kind, sourceUrl: p.sourceUrl ?? null, name: p.name } : null;
  },
});

export const listCrawledPlans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("plans").collect();
    return all.filter((p) => p.kind === "crawled").map((p) => ({ _id: p._id }));
  },
});

export const writeSnapshot = internalMutation({
  args: {
    planId: v.id("plans"), priceKobo: v.number(), sourceUrl: v.string(),
    title: v.optional(v.string()), statusCode: v.optional(v.number()), creditsUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.priceKobo < LIMITS.PRICE_MIN_KOBO || args.priceKobo > LIMITS.PRICE_MAX_KOBO) {
      // validation window (C3 edge) — keep cache, log miss
      await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "price_changed",
        publicText: `Crawl returned an out-of-range figure — kept last checked price` });
      return { kept: true };
    }
    const plan = await ctx.db.get(args.planId);
    if (!plan) return { kept: true };
    const changed = plan.priceKobo !== args.priceKobo;
    await ctx.db.insert("priceSnapshots", {
      planId: args.planId, priceKobo: args.priceKobo, sourceUrl: args.sourceUrl,
      scrapedAt: Date.now(), title: args.title, statusCode: args.statusCode,
      creditsUsed: args.creditsUsed, changed, origin: "crawl",
    });
    await ctx.db.patch(args.planId, { priceKobo: args.priceKobo, lastCrawlAt: Date.now() });
    if (changed) {
      const cycle = await ctx.db.query("cycles")
        .withIndex("by_plan_state", (q) => q.eq("planId", args.planId).eq("state", "open")).unique();
      if (cycle && !plan.isDemo) await ctx.db.patch(cycle._id, { duesKobo: duesPerSeat(args.priceKobo, plan.seatsTotal) });
      await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "price_changed",
        publicText: `Price changed at source: ${formatNaira(plan.priceKobo)} → ${formatNaira(args.priceKobo)} — dues recomputed` });
      const seats = await ctx.db.query("seats").withIndex("by_plan", (q) => q.eq("planId", args.planId)).collect();
      for (const seat of seats) {
        if (seat.memberEmail && seat.state !== "evicted") {
          await ctx.scheduler.runAfter(0, internal.emailRail.enqueueSend, {
            kind: "price_changed", planId: args.planId, to: seat.memberEmail,
            subject: `${plan.name}: the price changed at the source`,
            text: `The provider's public price moved: ${formatNaira(plan.priceKobo)} → ${formatNaira(args.priceKobo)}.\nYour dues recompute from the new price next cycle. Source: ${args.sourceUrl}`,
          });
        }
      }
    }
    return { kept: false, changed };
  },
});

export const logCrawlMiss = internalMutation({
  args: { planId: v.id("plans"), reason: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "price_changed",
      publicText: `Price re-check failed (${args.reason.slice(0, 80)}) — showing last checked price` });
  },
});
