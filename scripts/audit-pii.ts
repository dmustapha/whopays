// File: scripts/audit-pii.ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load .env.local so `npm run audit:pii` works without external env-file flags (Node 20.6+).
try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

async function main() {
  const surfaces: Array<[string, any]> = [
    ["listPlans", await client.query(api.plans.listPlans, {})],
    ["getBoard", await client.query(api.plans.getBoard, { slug: "spotify-family-demo" })],
    ["getEventLog", await client.query(api.plans.getEventLog, { limit: 200 })],
    ["getEmailLedger", await client.query(api.plans.getEmailLedger, { limit: 100 })],
    ["getSendBudget", await client.query(api.plans.getSendBudget, {})],
  ];
  let fail = 0;
  for (const [name, data] of surfaces) {
    const s = JSON.stringify(data);
    if (EMAIL_RE.test(s)) { console.error(`FAIL ${name}: email address in public payload (PII_PROJECTION_VIOLATION)`); fail++; }
    else console.log(`PASS ${name}: no address shapes`);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
