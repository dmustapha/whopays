// Idempotent. Creates: owner session inputs, demo plan, anchor plan, AgentMail inbox, REAL price crawl.
// NEVER creates members, waitlist rows, or events beyond plan creation (NN-1 / LAW 4).
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load .env.local so `npm run seed` works without external env-file flags (Node 20.6+).
try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }

const url = process.env.VITE_CONVEX_URL;
const ownerSecret = process.env.OWNER_SECRET;
if (!url || !ownerSecret) { console.error("Set VITE_CONVEX_URL and OWNER_SECRET"); process.exit(1); }
const client = new ConvexHttpClient(url);

async function main() {
  const { token } = await client.mutation(api.plans.ownerLogin, { secret: ownerSecret! });
  const inboxId = process.env.AGENTMAIL_INBOX_ID ?? "PENDING_INBOX";

  const demoId = await client.mutation(api.plans.createPlan, {
    ownerToken: token, slug: "spotify-family-demo",
    name: "Spotify Premium Family (demo)",
    kind: "crawled", sourceUrl: "https://www.spotify.com/ng/premium/",
    priceKobo: 2500_00, seatsTotal: 6, cycleMinutes: 3,
    isDemo: true, demoLabel: "demo plan — replying PAID is the payment · cycles every 3 minutes",
    autoConfirm: true, anchorReadOnly: false, inboxId,
  });
  console.log("demo plan:", demoId);

  const anchorId = await client.mutation(api.plans.createPlan, {
    ownerToken: token, slug: "household-internet",
    name: "Household internet (owner's real bill)",
    kind: "ownerEntered", sourceUrl: undefined,
    priceKobo: 38_000_00, seatsTotal: 4, cycleMinutes: 30 * 24 * 60,
    isDemo: false, demoLabel: undefined,
    autoConfirm: false, anchorReadOnly: true, inboxId,
  });
  console.log("anchor plan:", anchorId);

  // REAL crawl at seed time — the demo plan's price is earned, not typed (NN-3).
  const crawl = await client.action(api.prices.scrapePlanPrice, { planId: demoId, ownerToken: token });
  console.log("seed crawl:", crawl);
  if (!crawl.ok) console.warn("Crawl kept cache — check FIRECRAWL_API_KEY / G1 gate before demo.");
  console.log("Seed complete. Members: 0 by design — all board population comes from real joins.");
}
main().catch((e) => { console.error(e); process.exit(1); });
