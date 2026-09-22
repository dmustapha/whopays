#!/usr/bin/env node
/**
 * DEV-P3-2 — @agentmail/convex@0.1.0 ships without declaring its environment variables.
 * Convex components are env-isolated (docs: components/authoring "A component's functions are
 * isolated from the app's environment variables"), so the component's `performSend` action reads
 * an empty `process.env.AGENTMAIL_API_KEY` and EVERY outbound email fails
 * "AGENTMAIL_API_KEY is not set on this Convex deployment".
 *
 * Fix: declare the env vars in the component's convex.config so the app can pass them through
 * (convex/convex.config.ts does `app.use(agentmail, { env: {...} })`, mirroring the firecrawl
 * component which ships this declaration correctly).
 *
 * This script re-applies the patch idempotently. Wired as a postinstall so `npm install` keeps it.
 * Reported upstream as organizer/DX feedback.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const targets = [
  "node_modules/@agentmail/convex/dist/component/convex.config.js",
  "node_modules/@agentmail/convex/src/component/convex.config.ts",
];

const patched = `import { defineComponent } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config";

// PATCH (WhoPays DEV-P3-2): declare env so the app can pass AGENTMAIL_API_KEY into this
// env-isolated component. 0.1.0 omits this, so every outbound send fails "not set".
const component = defineComponent("agentmail", {
  env: {
    AGENTMAIL_API_KEY: v.optional(v.string()),
    AGENTMAIL_BASE_URL: v.optional(v.string()),
    AGENTMAIL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});
component.use(workpool, { name: "sendPool" });
component.use(workpool, { name: "callbackPool" });

export default component;
`;

let applied = 0;
for (const t of targets) {
  if (!existsSync(t)) continue;
  const cur = readFileSync(t, "utf8");
  if (cur.includes("AGENTMAIL_API_KEY")) { applied++; continue; } // already patched
  writeFileSync(t, patched);
  applied++;
  console.log(`[patch-agentmail-env] patched ${t}`);
}
if (applied === 0) console.log("[patch-agentmail-env] @agentmail/convex not installed — nothing to patch");
else console.log("[patch-agentmail-env] done");
