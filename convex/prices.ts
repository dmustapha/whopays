"use node";
import { internalAction, action } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";

const firecrawl = new FirecrawlClient(components.firecrawl);

// Public wrapper: owner-gated (FINDING-9 — unauthenticated crawls would burn credits).
// Multi-tenant: caller must be signed in AND own this plan.
export const scrapePlanPrice = action({
  args: { planId: v.id("plans") },
  handler: async (ctx, args): Promise<{ ok: boolean; priceKobo?: number; reason?: string }> => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return { ok: false, reason: "OWNER_ONLY" };
    const owns = await ctx.runQuery(internal.pricesDb.userOwnsPlan, { userId: uid, planId: args.planId });
    if (!owns) return { ok: false, reason: "OWNER_ONLY" };
    return await ctx.runAction(internal.prices.scrapePlanPriceInternal, { planId: args.planId });
  },
});

// The actual crawl (internal — cron + gated wrapper only).
export const scrapePlanPriceInternal = internalAction({
  args: { planId: v.id("plans") },
  handler: async (ctx, args): Promise<{ ok: boolean; priceKobo?: number; reason?: string }> => {
    const plan = await ctx.runQuery(internal.pricesDb.getPlanForCrawl, { planId: args.planId });
    if (!plan || plan.kind !== "crawled" || !plan.sourceUrl) return { ok: false, reason: "not a crawled plan" };
    try {
      const doc = await firecrawl.scrape(ctx, plan.sourceUrl, {
        formats: ["markdown"], location: { country: "NG" }, onlyMainContent: true, timeout: 30000,
      });
      const md = doc.markdown ?? "";
      if (md.length < 200) return await keepCache(ctx, args.planId, "thin page / interstitial");
      const extracted = await ctx.runAction(internal.ai.extractPlans, { markdown: md.slice(0, 12000) });
      const match = pickPlan(extracted, plan.name);
      if (!match) return await keepCache(ctx, args.planId, "no matching plan extracted");
      await ctx.runMutation(internal.pricesDb.writeSnapshot, {
        planId: args.planId, priceKobo: match.priceKobo, sourceUrl: plan.sourceUrl,
        title: doc.metadata?.title, statusCode: doc.metadata?.statusCode, creditsUsed: doc.metadata?.creditsUsed,
      });
      return { ok: true, priceKobo: match.priceKobo };
    } catch (err: any) {
      return await keepCache(ctx, args.planId, `scrape failed: ${err?.data?.status ?? err?.message ?? "unknown"}`);
    }
  },
});

// FINDING-3 fix: add-plan-by-URL (PRD F2 / Demo S5) — scrape ANY public pricing URL,
// return extracted candidates for the owner to pick from. Owner-gated like scrapePlanPrice.
export const extractFromUrl = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; candidates?: Array<{ plan_name: string; priceKobo: number }>; reason?: string }> => {
    const uid = await getAuthUserId(ctx);       // any signed-in user may crawl-to-create (pre-plan)
    if (!uid) return { ok: false, reason: "OWNER_ONLY" };
    try {
      const doc = await firecrawl.scrape(ctx, args.url, {
        formats: ["markdown"], location: { country: "NG" }, onlyMainContent: true, timeout: 30000,
      });
      const md = doc.markdown ?? "";
      if (md.length < 200) return { ok: false, reason: "thin page / interstitial" };
      const candidates = await ctx.runAction(internal.ai.extractPlans, { markdown: md.slice(0, 12000) });
      if (candidates.length === 0) return { ok: false, reason: "no plans with explicit prices found" };
      return { ok: true, candidates };
    } catch (err: any) {
      return { ok: false, reason: `scrape failed: ${err?.data?.status ?? err?.message ?? "unknown"}` };
    }
  },
});

// Weekly cron across all crawled plans (F4).
export const priceWatchAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.runQuery(internal.pricesDb.listCrawledPlans, {});
    for (const p of plans) {
      await ctx.runAction(internal.prices.scrapePlanPriceInternal, { planId: p._id });
    }
  },
});

// C3 mitigation: on any failure, KEEP CACHE and log honestly — never blank, never fabricate.
async function keepCache(ctx: any, planId: any, reason: string): Promise<{ ok: false; reason: string }> {
  await ctx.runMutation(internal.pricesDb.logCrawlMiss, { planId, reason });
  return { ok: false, reason };
}

function pickPlan(extracted: Array<{ plan_name: string; priceKobo: number }>, planName: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(planName);
  // by-name match first (C4 edge: never by position)
  return (
    extracted.find((e) => target.includes(norm(e.plan_name)) || norm(e.plan_name).includes("family")) ??
    extracted.find((e) => target.includes(norm(e.plan_name).slice(0, 6))) ?? null
  );
}
