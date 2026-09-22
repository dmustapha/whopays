// Recomputes headline claims from the live deployment; refuses read-back of claimed values.
// Writes evidence/claims-recompute.json. Non-zero exit on any mismatch with docs/pipeline/claims.json.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

// DEV-P6-1: self-load .env.local so `npm run verify:claims` works without an external flag
// (mirrors scripts/seed-demo.ts + the audit scripts).
try { (process as any).loadEnvFile?.(".env.local"); } catch { /* env may already be injected */ }

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);

async function main() {
  const plans: any[] = await client.query(api.plans.listPlans, {});
  const events: any[] = await client.query(api.plans.getEventLog, { limit: 200 });
  const budget: any = await client.query(api.plans.getSendBudget, {});
  const board: any = await client.query(api.plans.getBoard, { slug: "spotify-family-demo" });

  const recomputed = {
    at: new Date().toISOString(),
    plans_total: plans.length,
    crawled_plans: plans.filter((p) => p.kind === "crawled").length,
    demo_price_kobo: board?.snapshot?.priceKobo ?? null,
    demo_price_source: board?.snapshot?.sourceUrl ?? null,
    evictions_total: events.filter((e) => e.type === "evict").length,
    promotions_total: events.filter((e) => e.type === "promote").length,
    emails_sent_today: budget.sent,
  };
  writeFileSync("evidence/claims-recompute.json", JSON.stringify(recomputed, null, 2));
  console.log(JSON.stringify(recomputed, null, 2));

  if (existsSync("docs/pipeline/claims.json")) {
    const claims = JSON.parse(readFileSync("docs/pipeline/claims.json", "utf8"));
    let fail = 0;
    for (const [k, claimed] of Object.entries(claims.numbers ?? {})) {
      const actual = (recomputed as any)[k];
      if (actual !== undefined && actual !== claimed) {
        console.error(`CLAIM MISMATCH ${k}: claimed=${claimed} recomputed=${actual}`); fail++;
      }
    }
    process.exit(fail ? 1 : 0);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
