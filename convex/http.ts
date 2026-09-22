import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, components } from "./_generated/api";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { agentmail } from "./emailRail";

const http = httpRouter();

// 1. AgentMail inbound webhook (Svix-verified + deduped inside handleWebhook)
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  // DEV-P2-3: httpAction ctx is GenericActionCtx; handleWebhook's param type is the narrower
  // RunMutationCtx (structural mismatch on the runMutation overload). Runtime-compatible — the
  // action ctx supplies runMutation — so a boundary cast is the correct type-only shim.
  handler: httpAction(async (ctx, req) => agentmail.handleWebhook(ctx as any, req)),
});

// 2. Build info (judge-verifiable deploy provenance; commit baked at deploy)
http.route({
  path: "/api/build-info",
  method: "GET",
  handler: httpAction(async () => Response.json({
    commit: process.env.BUILD_COMMIT ?? "unset",
    deployedAt: process.env.BUILD_DEPLOYED_AT ?? "unset",
    app: "whopays",
  })),
});

// 3. Machine-readable proof (pairs with scripts/public-proof.sh — judge diffs the two)
http.route({
  path: "/api/proof",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const plans = await ctx.runQuery(api.plans.listPlans, {});
    return Response.json({
      plans: plans.map((p: any) => ({
        slug: p.slug, name: p.name, kind: p.kind, priceKobo: p.priceKobo,
        sourceUrl: p.sourceUrl, lastCrawlAt: p.lastCrawlAt,
      })),
      how_to_verify: "curl the sourceUrl yourself and grep the naira figure — no access to our infra required",
    });
  }),
});

// 4. Static site catch-all LAST (explicit routes above win — D-2)
registerStaticRoutes(http, components.staticHosting);

export default http;
