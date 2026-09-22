# Hackathon log

- **Project:** WhoPays
- **Event:** Convex All Gas Hackathon
- **What it does:** A live ledger for shared recurring bills — crawled real prices set each member's dues, members act entirely by email, and a scheduler enforces eviction and promotion while every screen live-syncs.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** Convex static hosting
- **Convex deployment:** https://resilient-goose-83.convex.cloud
- **Components:** @agentmail/convex, @firecrawl/firecrawl-convex, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions, scheduled functions, crons, realtime queries
- **Auth:** none
- **AI models:** gpt-4o-mini
- **Started:** 2026-09-22T06:35:00Z
- **Last updated:** 2026-09-22T07:32:00Z

## Log

### 2026-09-22 - 3c7efdc
Set up the Convex All Gas Hackathon environment: installed the official convex-hackathon-skill and re-verified the deadline from the official event page (Sep 22, 12:00 PM PT).

### 2026-09-22 - fd69190
Scaffolded a Vite + React SPA with Convex and the three sponsor components (`@agentmail/convex`, `@firecrawl/firecrawl-convex`, `@convex-dev/static-hosting`) — all resolve and install cleanly.

### 2026-09-22 - 7f7068d
Provisioned a cloud Convex dev deployment and set the server-side OpenAI, Firecrawl, AgentMail, and owner-secret environment variables on it.

### 2026-09-22 - fe7a8a5
Added the honesty skeleton (claims ledger, security threat model, invariants), a headline-recompute verifier and a public-proof script, and a CI workflow. Ran the hour-1 capability gates: a live NG-geo Firecrawl scrape of a public streaming price page returned the expected naira figure; a real bidirectional email round-trip (send, deliver, reply) completed through AgentMail in seconds; and the OpenAI key answered live. The public-proof script confirms the displayed hero price exists on the public source page with no dependency on our own infrastructure.

### 2026-09-22 - 302ec1d..a2f6a31
Built the deterministic core (money math in kobo, reply top-content stripper, named guard codes), a 12-table schema with indexes (plans, seats, waitlist, cycles, payments, price snapshots, events, email log, send budget, and more), and the live board queries plus the join/confirm/reinstate mutations. The ugly-reply corpus passes (20 tests), and the owner-only guard on seat enrollment fires before anything else runs. Convex features: schema, indexes, queries, mutations (`convex/schema.ts`, `convex/plans.ts`, `convex/membership.ts`, `convex/lib/`).

### 2026-09-22 - 793a9ed..e30919d
Registered the three sponsor components and wired the two adapter surfaces: the OpenAI reconciliation/plan-extraction action (strict JSON schema, degrades to a pending-parse state rather than inventing an amount), and the AgentMail email rail — every outbound send funneled through one budget-checked chokepoint, inbound mail arriving as a signed webhook that lands as a mutation, with a polling fallback. Added the HTTP routes: the signed AgentMail webhook, a build-info provenance endpoint, a machine-readable proof endpoint, and the static-site catch-all. Proven live on the deployment's public site URL: a real inbound reply routed through the signed webhook into the email log with the sender address redacted, and a forged unsigned POST was rejected with 401. Convex features: actions, HTTP actions, scheduled functions, registered components (`convex/ai.ts`, `convex/emailRail.ts`, `convex/http.ts`, `convex/convex.config.ts`).

### 2026-09-22 - fc37c49
Built the price-intelligence spine (a live NG-geo crawl of the public Spotify price page → a stored snapshot with source URL and timestamp → per-seat dues) and the cycle engine — one transactional mutation that, at each deadline, evicts the unpaid seat, promotes the next person in the waitlist, closes the cycle and opens the next, driven by a one-minute cron heartbeat with a weekly price watch and a keep-alive. The race between two waitlisters for one freed seat is covered by an optimistic-concurrency test, and the send-budget thresholds by another. Then the whole loop was proven live end to end on the cloud deployment: someone joins with only an email, the scheduler seats them, a dues email goes out, they reply "PAID", the reply routes back through the signed webhook, and their seat turns green — with no login anywhere. Convex features: crons, scheduled functions, optimistic concurrency, realtime queries (`convex/prices.ts`, `convex/pricesDb.ts`, `convex/cycles.ts`, `convex/crons.ts`).
