# Hackathon log

- **Project:** WhoPays
- **Event:** Convex All Gas Hackathon
- **What it does:** A live ledger for shared recurring bills — crawled real prices set each member's dues, members act entirely by email, and a scheduler enforces eviction and promotion while every screen live-syncs.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** Convex static hosting
- **Convex deployment:** https://resilient-goose-83.convex.cloud
- **Components:** none yet
- **Convex features:** none yet
- **Auth:** none
- **AI models:** gpt-4o-mini
- **Started:** 2026-09-22T06:35:00Z
- **Last updated:** 2026-09-22T06:45:00Z

## Log

### 2026-09-22 - 3c7efdc
Set up the Convex All Gas Hackathon environment: installed the official convex-hackathon-skill and re-verified the deadline from the official event page (Sep 22, 12:00 PM PT).

### 2026-09-22 - fd69190
Scaffolded a Vite + React SPA with Convex and the three sponsor components (`@agentmail/convex`, `@firecrawl/firecrawl-convex`, `@convex-dev/static-hosting`) — all resolve and install cleanly.

### 2026-09-22 - 7f7068d
Provisioned a cloud Convex dev deployment and set the server-side OpenAI, Firecrawl, AgentMail, and owner-secret environment variables on it.

### 2026-09-22 - fe7a8a5
Added the honesty skeleton (claims ledger, security threat model, invariants), a headline-recompute verifier and a public-proof script, and a CI workflow. Ran the hour-1 capability gates: a live NG-geo Firecrawl scrape of a public streaming price page returned the expected naira figure; a real bidirectional email round-trip (send, deliver, reply) completed through AgentMail in seconds; and the OpenAI key answered live. The public-proof script confirms the displayed hero price exists on the public source page with no dependency on our own infrastructure.
