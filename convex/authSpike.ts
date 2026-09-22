// SPIKE: prove signup->login->identity-in-a-mutation works on Convex Auth 0.0.95.
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const whoAmI = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return { userId: userId ?? null, authed: userId !== null };
  },
});
