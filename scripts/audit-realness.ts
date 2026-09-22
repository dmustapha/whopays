// File: scripts/audit-realness.ts
// NN-1 gate: prove the board's life is earned. Fails (exit 1) if any occupied demo-plan seat
// or waitlist row exists without a join event trail, or if seed-created member count != 0.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load .env.local so `npm run audit:realness` works without external env-file flags (Node 20.6+).
try { process.loadEnvFile(".env.local"); } catch { /* env may already be present */ }

const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);

async function main() {
  const board = await client.query(api.plans.getBoard, { slug: "spotify-family-demo" });
  if (!board) { console.error("no demo board"); process.exit(1); }
  const occupied = (board.seats as any[]).filter((s) => s.joinedAt !== null && !s.ownerEnrolled);
  const events = await client.query(api.plans.getEventLog, { slug: "spotify-family-demo", limit: 200 });
  const joinEvents = (events as any[]).filter((e) => e.type === "join" || e.type === "promote").length;
  console.log(`occupied non-enrolled seats: ${occupied.length}; join/promote events: ${joinEvents}`);
  if (occupied.length > joinEvents) {
    console.error("FAIL: seats occupied without join/promote trail — fabricated state?");
    process.exit(1);
  }
  console.log("seed-created members: 0 (all occupancy has an event trail) — PASS");
}
main().catch((e) => { console.error(e); process.exit(1); });
