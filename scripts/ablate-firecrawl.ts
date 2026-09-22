// File: scripts/ablate-firecrawl.ts
// Proves: without Firecrawl, crawl-backed dues cannot refresh. Run AFTER `npx convex env remove FIRECRAWL_API_KEY`
// (restore with `npx convex env set` after). Expects the scrape to FAIL and cache to be kept.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { authAsSystemOwner } from "./systemOwner";

// Load .env.local so this runs without external env-file flags (Node 20.6+).
try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);
async function main() {
  await authAsSystemOwner(client);
  const plans = await client.query(api.plans.listPlans, {});
  const demo = plans.find((p: any) => p.slug === "spotify-family-demo");
  if (!demo) { console.error("no demo plan"); process.exit(1); }
  const r = await client.action(api.prices.scrapePlanPrice, { planId: demo._id });
  if (r.ok) { console.error("ABLATION FAILED: scrape succeeded without Firecrawl?"); process.exit(1); }
  console.log(`ABLATION PROVEN: crawl path dead without Firecrawl (${r.reason}). Board shows last-checked cache — no fabricated price.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
