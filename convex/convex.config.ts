import { defineApp } from "convex/server";
import { v } from "convex/values";
import agentmail from "@agentmail/convex/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// DEV-P2-1: firecrawl component declares required `env` (FIRECRAWL_API_KEY) — the app must
// wire it through typed component env or the push fails a precondition. Root env alone is not
// enough for env-declaring components.
const app = defineApp({
  env: {
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
    // DEV-P3-2: @agentmail/convex@0.1.0 reads process.env inside its (env-isolated) component
    // runtime but its convex.config doesn't DECLARE env — so the deployment key never reaches
    // the component and every outbound send fails "AGENTMAIL_API_KEY is not set". We patch the
    // component's convex.config to declare these (scripts/patch-agentmail-env.mjs) and pass
    // them through here, mirroring the firecrawl pattern.
    AGENTMAIL_API_KEY: v.string(),
    AGENTMAIL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});
app.use(agentmail, {
  env: {
    AGENTMAIL_API_KEY: app.env.AGENTMAIL_API_KEY,
    AGENTMAIL_WEBHOOK_SECRET: app.env.AGENTMAIL_WEBHOOK_SECRET,
  },
});
app.use(firecrawl, {
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});
app.use(staticHosting); // keep-routes-at-root mode: no httpPrefix — http.ts registers routes explicitly (D-2)
export default app;
