// LIVE e2e proof of the multi-tenant model against the real deployment:
//  1. Owner A signs up (regular user) and creates their OWN plan from scratch.
//  2. A sees it in myPlans; a member joins A's board by email (public, no auth).
//  3. Owner B signs up; B CANNOT touch A's plan (per-plan IDOR boundary) -> OWNER_ONLY.
//  4. A can update A's own plan.
// Exits non-zero on any failed assertion. This is the authz gate for the auth migration.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

try { process.loadEnvFile(".env.local"); } catch {}
const url = process.env.VITE_CONVEX_URL!;
const rnd = () => Math.random().toString(36).slice(2, 9);

async function newOwner() {
  const c = new ConvexHttpClient(url);
  const email = `owner-${rnd()}@example.com`;
  const res: any = await c.action(api.auth.signIn, { provider: "password", params: { email, password: "Passw0rd-" + rnd(), flow: "signUp" } });
  c.setAuth(res.tokens.token);
  return { c, email };
}
function assert(cond: any, msg: string) { if (!cond) { console.error("FAIL:", msg); process.exit(1); } console.log("ok:", msg); }

async function main() {
  // 1. Owner A creates a plan they own
  const A = await newOwner();
  const planId = await A.c.mutation(api.plans.createPlan, {
    slug: `bill-${rnd()}`, name: "A's shared bill", kind: "ownerEntered",
    priceKobo: 10_000_00, seatsTotal: 3, cycleMinutes: 30 * 24 * 60, anchorReadOnly: false, inboxId: "",
  });
  assert(planId, "Owner A created a plan (self-serve genesis)");

  const mine = await A.c.query(api.plans.myPlans, {});
  assert(mine.some((p: any) => p._id === planId), "A's myPlans includes A's plan");
  const board = await A.c.query(api.plans.getBoard, { slug: mine.find((p: any) => p._id === planId)!.slug });
  assert(board?.plan?._id === planId, "A's board is publicly resolvable by slug (add-others link)");

  // 2. A member joins A's board by email (public, no auth)
  const anon = new ConvexHttpClient(url);
  const join = await anon.mutation(api.membership.joinWaitlist, { slug: (board as any).plan.slug, email: `member-${rnd()}@example.com` });
  assert(join?.position >= 1, "A member joined A's plan by email (no signup)");

  // 3. Owner B cannot touch A's plan (IDOR boundary)
  const B = await newOwner();
  const bPlans = await B.c.query(api.plans.myPlans, {});
  assert(bPlans.every((p: any) => p._id !== planId), "B's myPlans does NOT include A's plan (isolation)");
  let blocked = false;
  try { await B.c.mutation(api.plans.updateOwnerPrice, { planId, priceKobo: 1_00 }); }
  catch (e: any) { blocked = /OWNER_ONLY/.test(String(e?.message)); }
  assert(blocked, "B updating A's plan is REJECTED with OWNER_ONLY (per-plan IDOR)");

  // 4. A can update A's own plan
  const upd = await A.c.mutation(api.plans.updateOwnerPrice, { planId, priceKobo: 12_000_00 });
  assert(upd?.next === 12_000_00, "A can update A's own plan price");

  console.log("\nMULTI-TENANT E2E PASSED — self-serve create + member join + per-plan IDOR isolation all proven live.");
}
main().catch((e) => { console.error(e); process.exit(1); });
