# Architecture Decision Records — WhoPays

## ADR-001: Firecrawl via the Convex component, not raw REST
- Context: prices must be scraped with NG geo-targeting from Convex actions.
- Decision: `@firecrawl/firecrawl-convex` component; `location:{country:"NG"}` passed natively.
- Rejected: raw `fetch` to api.firecrawl.dev — duplicates retry/auth the component already ships, and a registered component is itself rubric-row-2 evidence.
- Consequence: one `"use node"` file (`convex/prices.ts`); DB legs split into `pricesDb.ts`.

## ADR-002: static-hosting in keep-routes-at-root mode
- Context: one convex.site domain must serve the SPA, the AgentMail webhook, and proof endpoints.
- Decision: no `httpPrefix` on the component; `convex/http.ts` registers explicit routes first, `registerStaticRoutes` as catch-all.
- Rejected: root-mounted mode (`defineApp({httpPrefix:"/api"})`) — relocates every route and couples the webhook path to a mount decision.
- Consequence: explicit-routes-first precedence must be preserved when adding routes.

## ADR-003: No member auth; owner uses a secret-to-session login
- Context: Convex Auth v2 is "super duper alpha"; members-by-email is the core idea.
- Decision: members have no accounts (email is identity); owner console = OWNER_SECRET → server-side session token.
- Rejected: Auth v2 (alpha risk on a judged surface); member accounts (kills the no-signup hero flow).
- Consequence: owner mutations all take `ownerToken`; authz matrix is tiny and greppable.

## ADR-004: BYO OpenAI gpt-4o-mini with strict json_schema
- Context: AI Gateway is paid-plan-only; an alternative gateway key failed validation.
- Decision: direct fetch with `response_format: json_schema, strict: true`.
- Rejected: AI Gateway (spend decision, paid); an alternative gateway (key failed validation).
- Consequence: OpenAI outage degrades to `pending_parse`, never fabricated output.

## ADR-005: Deterministic pre-classifier ahead of the LLM
- Context: the on-camera reply is "PAID"; the kill-shot must not depend on LLM latency/availability.
- Decision: regex pre-classification resolves paid-claims + auto-replies; OpenAI reads everything else (bank alerts, phrasing, amounts).
- Rejected: LLM-classifies-everything — puts R5 (OpenAI outage) inside the hero loop.
- Consequence: ablate-openai proves the AI is load-bearing for the non-trivial flows, while the hero stays deterministic.

## ADR-006: Hash routing in the SPA
- Context: static-hosting's SPA-fallback behavior for deep paths is unverified.
- Decision: `#/plan/:slug` hash routes — zero server cooperation needed.
- Rejected: react-router history mode (needs a rewrite rule we can't verify in-window).
- Consequence: shareable deep links work from any static file server.

## ADR-007: Emails plaintext in private tables; privacy enforced at the projection
- Context: an earlier design drafted "hashed + encrypted" member emails; Convex mutations are deterministic (no reliable crypto), and the DB isn't publicly readable anyway.
- Decision: raw emails stored in non-projected fields; every public query builds responses through an allowlist projection; ledger counterparties redacted AT WRITE TIME to "[redacted inbox]".
- Rejected: hashing (breaks reply-to-seat matching); encryption-at-rest fields (theater — the key would sit beside the data).
- Consequence: `audit-pii.ts` is the enforcement test; the invariant unchanged.

## ADR-008: autoConfirm on the demo plan only
- Context: a judge replying PAID at 3am must see green; real plans need the owner's human confirm ("matched, owner confirms").
- Decision: `plans.autoConfirm` (demo=true) flips matched→confirmed instantly with the visible badge "auto-confirmed (demo plan)".
- Rejected: global auto-confirm (erases the reconciliation honesty line); no auto-confirm (hero flow stalls on a sleeping owner).
- Consequence: the reconciliation language invariant holds on both surfaces.

## ADR-009: Anchor plan = owner-enrolled real household bill with anonymous labels
- Context: friend consents unavailable; the realness rule forbids fabricated members.
- Decision: anchorReadOnly plan; owner-enrolls real household participants as "owner-enrolled" seats; no names/initials; eviction engine skips owner-enrolled seats.
- Rejected: fake names (the invariant violation); friend initials (needs consent); dropping the anchor surface (loses the no-hidden-clock pairing proof).
- Consequence: demo video's mechanism beats run on operator-controlled real inboxes.

## ADR-010: Production deploy key only
- Context: static-hosting issue #38 — preview keys fail component asset upload.
- Decision: prod deploys from build onward; deploy early (DS-5) and cold-verify.
- Rejected: preview deployments (documented breakage).

## ADR-011: Webhook + 60s polling, one inbound pipeline
- Context: webhook outage mid-judging is CRITICAL (R3).
- Decision: both triggers feed the same `routeInbound`, idempotent via `alreadyProcessed`.
- Rejected: webhook-only (single point of failure on the hero loop); polling-only (adds up to 60s latency to the on-camera beat).
