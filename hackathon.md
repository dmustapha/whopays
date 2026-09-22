# Hackathon log

- **Project:** WhoPays
- **Event:** Convex All Gas Hackathon
- **What it does:** A live ledger for shared recurring bills — crawled real prices set each member's dues, members act entirely by email, and a scheduler enforces eviction and promotion while every screen live-syncs.
- **Live app:** https://beloved-minnow-486.convex.site
- **Demo:** https://youtu.be/dd2wJL17vZk
- **Repo:** https://github.com/dmustapha/whopays
- **Frontend:** Convex static hosting
- **Convex deployment:** https://beloved-minnow-486.convex.cloud
- **Components:** @agentmail/convex, @firecrawl/firecrawl-convex, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions, scheduled functions, crons, realtime queries, file storage (static hosting), auth
- **Auth:** Convex Auth
- **AI models:** gpt-4o-mini
- **Started:** 2026-09-22T06:35:00Z
- **Last updated:** 2026-09-22T18:45:00Z

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
Built the deterministic core (money math in kobo, reply top-content stripper, named guard codes), a 14-table schema with indexes (plans, seats, waitlist, cycles, payments, price snapshots, events, email log, send budget, and more), and the live board queries plus the join/confirm/reinstate mutations. The ugly-reply corpus passes (20 tests), and the owner-only guard on seat enrollment fires before anything else runs. Convex features: schema, indexes, queries, mutations (`convex/schema.ts`, `convex/plans.ts`, `convex/membership.ts`, `convex/lib/`).

### 2026-09-22 - 793a9ed..e30919d
Registered the three sponsor components and wired the two adapter surfaces: the OpenAI reconciliation/plan-extraction action (strict JSON schema, degrades to a pending-parse state rather than inventing an amount), and the AgentMail email rail — every outbound send funneled through one budget-checked chokepoint, inbound mail arriving as a signed webhook that lands as a mutation, with a polling fallback. Added the HTTP routes: the signed AgentMail webhook, a build-info provenance endpoint, a machine-readable proof endpoint, and the static-site catch-all. Proven live on the deployment's public site URL: a real inbound reply routed through the signed webhook into the email log with the sender address redacted, and a forged unsigned POST was rejected with 401. Convex features: actions, HTTP actions, scheduled functions, registered components (`convex/ai.ts`, `convex/emailRail.ts`, `convex/http.ts`, `convex/convex.config.ts`).

### 2026-09-22 - fc37c49
Built the price-intelligence spine (a live NG-geo crawl of the public Spotify price page → a stored snapshot with source URL and timestamp → per-seat dues) and the cycle engine — one transactional mutation that, at each deadline, evicts the unpaid seat, promotes the next person in the waitlist, closes the cycle and opens the next, driven by a one-minute cron heartbeat with a weekly price watch and a keep-alive. The race between two waitlisters for one freed seat is covered by an optimistic-concurrency test, and the send-budget thresholds by another. Then the whole loop was proven live end to end on the cloud deployment: someone joins with only an email, the scheduler seats them, a dues email goes out, they reply "PAID", the reply routes back through the signed webhook, and their seat turns green — with no login anywhere. Convex features: crons, scheduled functions, optimistic concurrency, realtime queries (`convex/prices.ts`, `convex/pricesDb.ts`, `convex/cycles.ts`, `convex/crons.ts`).

### 2026-09-22 - 436d1f9
Built the live board frontend — a seat map with a countdown, the append-only event log, the in-product email ledger (sender addresses redacted), and a send-budget meter, plus a plan page, an owner console, and a proof page — all bound directly to the deployment through realtime queries, so every screen updates the instant the backend changes. An idle board still reads clearly to a first-time visitor: it shows the "join to start the next cycle" invitation and a recap of the last real cycle. A seed script performs a genuine price crawl, is idempotent, and creates zero members, so the board's life is only ever earned by real joins. Deploy provenance is baked so the build-info endpoint reports the exact commit that is running (`src/`, `scripts/seed-demo.ts`).

### 2026-09-22 - multi-tenant
Turned WhoPays into a true multi-tenant product with Convex Auth. Any visitor can now create an account on the live app, create their own shared-bill plans, and own them: plans are scoped to the creator's user id, and every owner action (create, re-crawl, price update, confirm/reinstate a seat) is gated by a per-plan ownership check that rejects other users with `OWNER_ONLY`. Members stay email-only and never sign up — the join → evict → promote → PAID loop is unchanged. Replaced the single shared owner-secret with per-user identity; the demo and anchor boards are seeded under a system owner so judges still land on a live board and can join as members. Proven live end to end: a fresh user signs up, creates a plan, a member joins it by email, and a second user is blocked from touching the first user's plan (per-plan IDOR). Convex features: Convex Auth (Password), users/auth tables, per-owner indexes (`convex/auth.ts`, `convex/schema.ts`, `convex/plans.ts`, `convex/membership.ts`, `src/pages/OwnerConsole.tsx`).

### 2026-09-22 - working tree
Added the proof pack: realness and PII audits (the seed creates zero members; no email address ever appears in a public payload), a banned-term copy test wired into the suite (payments are only ever "matched", never "verified"; no login-sharing language; no hardcoded prices), sponsor ablations that each break the product when their key is invalid (no crawl without Firecrawl, no member interface without AgentMail, no reconciliation without OpenAI), and a recompute verifier that re-derives every headline number from the live deployment and fails on a wrong figure. A domain guide documents the concepts, rules, and glossary (`scripts/`, `tests/copy.test.ts`, `DOMAIN-GUIDE.md`).

### 2026-09-22 - 44932e9
Shipped to production on Convex static hosting: the SPA and backend run on the `beloved-minnow-486` deployment, the AgentMail webhook is registered against the live site, the demo and anchor boards are seeded, and the build-info endpoint reports the exact running commit. Applied the Solari design system across every surface. Recorded a screen-first walkthrough of the live product — a cold join, the scheduler evicting the unpaid seat and promoting the waitlist on a visible clock, a "reply PAID" turning a seat green, and a public pricing page crawled into a new plan — proving the full loop end to end on the deployed app. Demo: https://youtu.be/dd2wJL17vZk
