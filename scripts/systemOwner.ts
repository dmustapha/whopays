// Shared: authenticate a ConvexHttpClient as the seed SYSTEM OWNER (owns the showcase plans).
// Used by seed-demo + sponsor ablation scripts so they can call owner-gated actions.
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

export async function authAsSystemOwner(client: ConvexHttpClient): Promise<string> {
  const ownerSecret = process.env.OWNER_SECRET;
  if (!ownerSecret) throw new Error("OWNER_SECRET required");
  const email = process.env.SEED_OWNER_EMAIL ?? "system@whopays.app";
  const password = process.env.SEED_OWNER_PASSWORD ?? `Seed-${ownerSecret}-whopays`;
  for (const flow of ["signIn", "signUp"] as const) {
    try {
      const res: any = await client.action(api.auth.signIn, { provider: "password", params: { email, password, flow } });
      const token = res?.tokens?.token;
      if (token) { client.setAuth(token); break; }
    } catch { /* try next flow */ }
  }
  const who: any = await client.query(api.authSpike.whoAmI, {});
  if (!who?.userId) throw new Error("could not establish system owner identity");
  return who.userId as string;
}
