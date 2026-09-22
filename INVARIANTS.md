# INVARIANTS — Build-Agent Law (WhoPays)
> The build agent reads this as non-negotiable law. Violating any NON-NEGOTIABLE fails the hackathon gate. Derived from Thesis fields 5+6 (WINNER-BRIEF + AMEND-1), the PRD Risk Register, and the [C] concerns.

## NON-NEGOTIABLES

1. **No fabricated state on any judged surface (LAW 4 / thesis inv. 4).** Every seat, waitlist entry, event, payment, and email-ledger row traces to a real mutation caused by a real actor (a joiner's email, the scheduler, the owner). `seed-demo.ts` creates plans and inboxes ONLY — zero members, zero waitlist rows, zero events. — Test: `npx tsx scripts/audit-realness.ts` counts members/waitlist/events attributable to seed → must print `seed-created members: 0`. — Judge-attack: "You seeded the board to look alive." → Defense: the ONLY member-creating path for demo plans is the public `joinWaitlist` mutation; owner-enrollment is structurally rejected on `isDemo` plans with code **`DEMO_SEATS_JOIN_ONLY`**; owner-enrollment is legal only on `anchorReadOnly` plans and those seats render the literal badge "owner-enrolled". *(headline invariant — structurally unrepresentable: no code path exists to write a demo-plan seat except a real email join.)*

2. **Reconciliation language only — "matched", never anything stronger (thesis inv. 1).** The payment status enum is the closed set `{matched, confirmed, mismatch, pending_parse}` — no stronger member exists in the type. Crawl freshness badge says "last checked HH:MM". — Test: `npm test -- copy` (tests/copy.test.ts scans src/+convex/ line-by-line for `\bverif`, sole allowed line: the `/api/proof` `how_to_verify` key, which names the JUDGE's action on prices/commits, never payments) → green. — Judge-attack: "So you verify payments?" → Defense: copy everywhere reads "matched — owner confirms"; the type system cannot represent a stronger payment status; the banned-term test fails CI with **`COPY_BANNED_TERM`**.

3. **Every displayed price traces to a crawl or is labeled owner-entered (thesis inv. 3).** UI renders prices exclusively from `priceSnapshots` (sourceUrl + scrapedAt attached) or from `ownerEntered` plans carrying the literal badge "owner-entered" + source link. — Test: `npm test -- copy` (NN-3 case: zero hardcoded naira literals in src/ — the ProofPage grep figure is read from the live board); `bash scripts/public-proof.sh` re-curls the public page and greps the displayed figure → ≥1. — Judge-attack: "That price is hardcoded." → Defense: the board's price node renders `snapshot.priceKobo` with its `sourceUrl` + timestamp as a visible link; a missing snapshot renders state token **`NO_SNAPSHOT`** ("price pending crawl"), never a number.

4. **Member emails never rendered publicly (thesis inv. 5).** Public query results (`getBoard`, `getEventLog`, `getEmailLedger`) return display labels and hashed identifiers only — the `BoardView` type has no email field to leak. Email-ledger bodies are rendered with addresses redacted to `[redacted inbox]` (log-format rule). — Test: `npx tsx scripts/audit-pii.ts` calls every public query and greps results for `@` + RFC5322 patterns → 0 matches. — Judge-attack: "Join and read other members' emails from the API." → Defense: raw emails live in non-projected fields (`seats.memberEmail`, `waitlist.email` — ADR-007) never selected by the allowlist projections; every public query's payload additionally passes `assertNoPii()` (convex/lib/shared.ts), which throws **`PII_PROJECTION_VIOLATION`** on any address-shaped string before the response leaves the server; `scripts/audit-pii.ts` re-checks from outside.

5. **Eviction + promotion is one transaction — a seat can never double-fill (PRD R12).** `closeCycleTx` re-reads seat state inside the mutation (Convex OCC); the losing concurrent claimer stays waitlist #1 and an event with code **`RACE_REFUSED`** is appended. — Test: `npm test -- race.test.ts` fires two concurrent promotions at one seat → exactly one occupant, one `RACE_REFUSED` event. — Judge-attack: "Two waitlisters, one seat, same tick — who wins?" → Defense: transactional mutation; the refusal is a visible event-log row (a demo beat, not a bug).

6. **No login-sharing or circumvention anywhere in product copy (thesis inv. 2).** Supported plan kinds are household plans, official Extra-Member seats, and non-subscription bills; the app's only external read is public price pages. — Test: `grep -rniE "share (your )?(login|password|account)|bypass|circumvent" src/ emails/` → 0. — Judge-attack: "Isn't this a password-sharing tool?" → Defense: no credential field exists anywhere in the schema (structurally unrepresentable — there is no place to put a Netflix password); copy names official seat types; violation grep fails CI with **`COPY_BANNED_TERM`**.

7. **Every outbound email passes the budget chokepoint.** All sends go through the single `enqueueSend` wrapper (convex/emailRail.ts) (budget check + emailLog append); non-critical sends are suppressed at 80/day with event code **`BUDGET_SUPPRESSED`**; hard stop at 100. — Test: `grep -rn "sendMessage(" convex/ | grep -v emailRail.ts` → 0 (no bypass call sites); `npm test -- budget` proves the 80/100 thresholds fire. — Judge-attack: "Social-post flood burns your cap mid-judging." → Defense: per-address join limit (2/day), transactional-only sends, and the visible send-budget meter showing suppression state — the cap is surfaced engineering, not a hidden failure.

8. **The email rail is the member's complete interface (peer-review ADOPT).** Every membership-state transition a member needs — join acknowledgment, dues, pay-report, eviction notice, promotion — is actionable purely through email; the web board is a live mirror, never a required member surface. — Test: hero-loop transcript (PLAN Task 3.3) shows the member's ONLY post-join interactions are emails and replies; the board changes with zero member web actions. — Judge-attack: "So the web app is the product and email is a gimmick?" → Defense: after the initial join, no member-facing mutation exists that email cannot trigger (`joinWaitlist` is the single web-side member mutation); remove the frontend entirely and members still get promoted, billed, evicted, and reconciled — the ablation story inverted.

### MUST NOT CLAIM
- Payment "verification" (we match and owners confirm; we never verify).
- Any Netflix/Spotify/Starlink account integration, API relationship, or partnership — our only read is their public pricing pages.
- "Prevents unauthorized sharing" / any enforcement over a provider's systems — authority is over the group's own ledger only.
- Category emptiness ("nothing like this exists") — Spliiit-class marketplaces exist; our difference is the ledger-for-YOUR-group + email rail + crawl-driven dues.
- "Guaranteed email delivery" (we show the ledger + budget instead).
- Any member count / usage number not recomputable from the live DB (`verify-claims`).
- "Trustless", "verified members", "bank integration", "escrow", or payment processing of any kind.

## VERIFY-BEFORE-CLAIMING
Every headline number/price/URL/hash in README, demo narration, hackathon.md, and the submission form must be recomputable from a committed source: `scripts/verify-claims.ts` re-derives each from the live deployment or committed data and fails on mismatch. No unbacked figure ships.

## RESOLVED DECISIONS
| # | Question | Options considered | Chosen | Why not the others | Status |
|---|---|---|---|---|---|
| D-1 | Firecrawl access path | component / raw REST | `@firecrawl/firecrawl-convex` component | REST adds custom retry/auth code for zero gain; component natively passes `location:{country:"NG"}` (client/index.ts L51/64) and is a rubric-visible registered component | RESOLVED |
| D-2 | Static hosting + webhook coexistence | root-mounted (`/api` prefix) / keep-routes-at-root | keep-routes-at-root: register `/agentmail/webhook` first, then `registerStaticRoutes` catch-all | root-mounted moves ALL http routes under /api; explicit-first precedence keeps the webhook path clean on one domain | RESOLVED |
| D-3 | Auth model | Convex Auth v2 (super-alpha) / member accounts / none | Members: email-only by design (no accounts). Owner: simple session token | Auth v2 is "super duper alpha" (hero risk); memberless-by-email IS the product thesis; "apps with no auth are still valid" (FAQ) | RESOLVED |
| D-4 | LLM + model | AI Gateway / AgentRouter / BYO OpenAI gpt-4o-mini | BYO OpenAI key, gpt-4o-mini | AI Gateway is paid-plan-only; AgentRouter key failed auth + rubric row-3 provenance risk; key validated live twice | RESOLVED |
| D-5 | Money representation | float naira / kobo integers | kobo integers everywhere; format at render | float currency drift is unpresentable | RESOLVED |
| D-6 | Frontend framework | Next.js / Vite+React SPA | Vite + React SPA | static-hosting serves static builds; SSR adds nothing to a live-query SPA; Convex useQuery is the state layer | RESOLVED |
| D-7 | Demo-clock honesty | hidden fast-forward / real per-plan cycleMinutes | `cycleMinutes` is a real labeled per-plan setting (demo=3 min, anchor=monthly) | hidden compressed clock is a thesis drift tripwire | RESOLVED |
| D-8 | Anchor-plan members without friend consent (AMEND-1) | fake names / initials of friends / anonymous owner-enrolled labels | owner-enrolled real household bill, anonymous seat labels, "owner-enrolled" badge, read-only | fake names violate NN-1; friend initials need consent Dami can't get; anonymous labels keep it real AND private | RESOLVED |
| D-9 | Payments | Paystack integration / report-and-confirm ledger | ledger only ("matched → owner confirms") | real payment processing is out-of-scope (WINNER-BRIEF) and would drag verification claims in | RESOLVED |
| D-10 | Deploy key type | preview / production | production deploy key only | static-hosting issue #38: preview keys fail component asset upload | RESOLVED |
| D-11 | Inbound robustness | webhook only / webhook + 60s polling cron | both (belt + braces) | webhook outage mid-judging is CRITICAL R3; polling is 5 lines against a verified API | RESOLVED |

(OPEN items are build-discovered FACTS only: `CONVEX_DEPLOYMENT_NAME`, AgentMail inbox addresses, measured cold-hit latency, G1 Netflix result → recorded in BUILD-REPORT + DEPLOYMENTS as they materialize.)

## SOURCE LOCK
| External identifier | Version / pin | Verify command | Expected output | Status |
|---|---|---|---|---|
| `@agentmail/convex` API surface | README@main (fetched 2026-09-21) | `curl -s https://raw.githubusercontent.com/agentmail-to/convex/main/README.md \| grep -cE "onMessageReceived\|handleWebhook\|sendMessage"` | ≥3 | [VERIFIED] |
| `@firecrawl/firecrawl-convex` location option | client/index.ts@main L51/64 | `curl -s https://raw.githubusercontent.com/firecrawl/firecrawl-convex/main/src/client/index.ts \| grep -c "LocationConfig"` | ≥2 | [VERIFIED] |
| `@convex-dev/static-hosting` root-routes mode | README@main | `curl -s https://raw.githubusercontent.com/get-convex/static-hosting/main/README.md \| grep -c registerStaticRoutes` | ≥1 | [VERIFIED] |
| Spotify NG Family price ₦2,500 | public page (probed 2026-09-21T23:24Z) | `curl -sL https://www.spotify.com/ng/premium/ \| grep -c "₦2,500"` | ≥1 | [VERIFIED] |
| OpenAI gpt-4o-mini via key in .env.local | live probe HTTP 200 | `curl -s -o /dev/null -w "%{http_code}" https://api.openai.com/v1/chat/completions -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"OK"}],"max_tokens":2}'` | 200 | [VERIFIED] |
| AgentMail free-tier caps (3 inboxes / 100/day) | agentmail.to/pricing (fetched) | `curl -s https://agentmail.to/pricing \| grep -ci "100 emails"` | ≥1 | [UNVERIFIED-build-gate] (re-check at G2) |
| Netflix NG price via location:NG | not yet run | G1 gate: scrape netflix.com/ng/ w/ location NG | ₦ price extracted | [UNVERIFIED-build-gate] |

## ESCALATE, DON'T FABRICATE
On any gate/task failure: stop, record BLOCKED with the failing gate name, and NEVER substitute a mock, cached-as-live result, stored-success response, or fabricated count. Fix autonomously where the fix needs no Dami-only input ([USER] directive 2026-09-21); surface immediately when it does (credentials, spend). Triage when over budget: cut stretch, then P1 via the Dami-ranked descope ladder ONLY on explicit change-order; NEVER a P0, the hero loop, or a security invariant. Escalate after 2 failures on the same gate.
