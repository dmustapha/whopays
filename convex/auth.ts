// Convex Auth (owner/creator identity for the multi-tenant model).
// Members remain email-only; ONLY plan owners/creators authenticate.
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
