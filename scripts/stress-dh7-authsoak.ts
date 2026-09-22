// STRESS DH-7: Convex Auth 0.0.95 alpha soak — concurrent signup/login/session under load.
// No emails sent. Proves identity resolution stays correct & isolated under concurrency.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
try { process.loadEnvFile(".env.local"); } catch {}
const URL = process.env.VITE_CONVEX_URL!;
async function signUpAndWhoAmI(i: number) {
  const c = new ConvexHttpClient(URL);
  const email = `soak+${Date.now()}-${i}@example.com`;
  const password = `Soak-${Date.now()}-${i}-pw`;
  const res: any = await c.action(api.auth.signIn, { provider: "password", params: { email, password, flow: "signUp" } });
  const token = res?.tokens?.token;
  if (!token) throw new Error(`#${i} no token`);
  c.setAuth(token);
  const who: any = await c.query(api.authSpike.whoAmI, {});
  // re-login as the same user on a FRESH client (session independence)
  const c2 = new ConvexHttpClient(URL);
  const res2: any = await c2.action(api.auth.signIn, { provider: "password", params: { email, password, flow: "signIn" } });
  c2.setAuth(res2?.tokens?.token);
  const who2: any = await c2.query(api.authSpike.whoAmI, {});
  return { i, uid: who?.userId, uid2: who2?.userId, match: who?.userId && who?.userId === who2?.userId };
}
async function main() {
  const N = 8;
  const results = await Promise.all(Array.from({ length: N }, (_, i) => signUpAndWhoAmI(i).catch((e) => ({ i, error: String(e) }))));
  const ok = results.filter((r: any) => r.match);
  const uids = new Set(ok.map((r: any) => r.uid));
  const errors = results.filter((r: any) => r.error);
  console.log(JSON.stringify({ N, resolved: ok.length, distinctUids: uids.size, reloginConsistent: ok.length, errors: errors.length }, null, 0));
  if (ok.length === N && uids.size === N && errors.length === 0)
    console.log("DH-7 LIVE: PASS — 8 concurrent signups each got a DISTINCT stable identity; re-login resolved the SAME uid; no cross-session bleed.");
  else { console.error("DH-7 LIVE: FAIL", JSON.stringify(results)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
