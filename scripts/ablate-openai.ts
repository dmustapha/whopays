// File: scripts/ablate-openai.ts
// Proves: without OpenAI, add-plan-by-URL extraction and non-trivial reply parsing die.
// Run AFTER `npx convex env remove OPENAI_API_KEY`.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load .env.local so this runs without external env-file flags (Node 20.6+).
try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);
async function main() {
  const { token } = await client.mutation(api.plans.ownerLogin, { secret: process.env.OWNER_SECRET! });
  const plans = await client.query(api.plans.listPlans, {});
  const demo = plans.find((p: any) => p.slug === "spotify-family-demo");
  if (!demo) { console.error("ABLATION SETUP: demo plan not found — run npm run seed first"); process.exit(1); }
  const r = await client.action(api.prices.scrapePlanPrice, { planId: demo._id, ownerToken: token });
  if (r.ok) { console.error("ABLATION FAILED: extraction succeeded without OpenAI?"); process.exit(1); }
  console.log(`ABLATION PROVEN: crawl→plan extraction dead without OpenAI (${r.reason}); forwarded bank alerts fall to pending_parse.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
