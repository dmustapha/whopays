// STRESS DH-8 live probe: a signed-in attacker cannot inject their plan into the public showcase
// (anchorReadOnly) or spoof another tenant's inbox (inboxId). Both must be forced safe server-side.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
try { process.loadEnvFile(".env.local"); } catch {}
const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);
async function main() {
  const email = `dh8-attacker+${Date.now()}@example.com`;
  const password = `Dh8-${Date.now()}-pw`;
  const res: any = await client.action(api.auth.signIn, { provider: "password", params: { email, password, flow: "signUp" } });
  const token = res?.tokens?.token;
  if (!token) throw new Error("could not auth attacker");
  client.setAuth(token);
  const slug = `dh8-spoof-${Date.now()}`;
  const planId = await client.mutation(api.plans.createPlan, {
    slug, name: "DH8 Spoof Attempt", kind: "ownerEntered", priceKobo: 500000,
    seatsTotal: 2, cycleMinutes: 43200,
    anchorReadOnly: true,                       // ATTACK: try to inject into public showcase
    inboxId: "whopays-demo@agentmail.to",       // ATTACK: try to spoof the demo inbox
  });
  // read back via owner-scoped myPlans
  const mine: any[] = await client.query(api.plans.myPlans, {});
  const p = mine.find((x) => x._id === planId);
  if (!p) throw new Error("created plan not visible to owner");
  const anchorForced = p.anchorReadOnly === false;
  const inboxForced = (p.inboxId ?? "") === "";
  // confirm it did NOT land in the public showcase (getEmailLedger/listPlans showcase filter)
  const showcase: any[] = await client.query(api.plans.listPlans, {});
  const inShowcase = showcase.some((x) => x._id === planId);
  console.log(JSON.stringify({ anchorReadOnly: p.anchorReadOnly, inboxId: p.inboxId, anchorForced, inboxForced, inPublicShowcase: inShowcase }));
  if (anchorForced && inboxForced && !inShowcase) console.log("DH-8 LIVE: PASS — spoof neutralized (anchorReadOnly forced false, inboxId forced empty, not in public showcase)");
  else { console.error("DH-8 LIVE: FAIL — spoof leaked through"); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
