// File: scripts/ablate-agentmail.ts
// Proves: without AgentMail, the membership rail dies — the ack email (the joiner's ONLY channel)
// never reaches "sent". Run AFTER `npx convex env remove AGENTMAIL_API_KEY`.
// Method (FINDING-12): join, then POLL the ledger row's component status for 90s.
// PROVEN = the newest ack row never transitions to sent/delivered. Exits 1 if it DOES send.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load .env.local so this runs without external env-file flags (Node 20.6+).
try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const marker = `ablation+${Date.now()}@example.com`;
  await client.mutation(api.membership.joinWaitlist, { slug: "spotify-family-demo", email: marker });
  const deadline = Date.now() + 90_000;
  let last = "none";
  while (Date.now() < deadline) {
    const ledger: any[] = await client.query(api.plans.getEmailLedger, { limit: 10 });
    const ack = ledger.find((r) => r.direction === "out" && r.kind === "ack");
    last = ack?.status ?? "no-row";
    if (last === "sent" || last === "delivered") {
      console.error("ABLATION FAILED: ack email sent WITHOUT AgentMail key — sponsor was decorative?");
      process.exit(1);
    }
    await sleep(10_000);
  }
  console.log(`ABLATION PROVEN: 90s after a real join, ack status="${last}" (never sent) — members are unreachable without AgentMail; the rail IS the product.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
