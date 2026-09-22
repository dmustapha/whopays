# WhoPays

**A live ledger for any shared recurring bill.** Crawled real prices set each member's dues, members act entirely by email, and a scheduler enforces eviction and promotion while every screen live-syncs. No member ever logs in.

> The scheduler doesn't negotiate.

[![Live](https://img.shields.io/badge/live-beloved--minnow--486.convex.site-79c78d)](https://beloved-minnow-486.convex.site)
[![Tests](https://img.shields.io/badge/tests-68%2F68-79c78d)](#tests)
[![Convex](https://img.shields.io/badge/backend-Convex-f0a92e)](https://www.convex.dev)
[![License](https://img.shields.io/badge/license-MIT-8f8a80)](LICENSE)

**Live app:** https://beloved-minnow-486.convex.site (open the board, join a seat with one email, watch it settle)

**Demo:** https://youtu.be/dd2wJL17vZk

[![WhoPays demo](https://img.youtube.com/vi/dd2wJL17vZk/maxresdefault.jpg)](https://youtu.be/dd2wJL17vZk)

**Judges:** every claim is keyless-verifiable — see **[JUDGES.md](JUDGES.md)** (one command: `npm run proof:public`).

## What Is WhoPays?

Splitting a Spotify Family plan, a shared Starlink, or the office coffee fund always rots into the same problem: someone has to chase everyone, every cycle, forever. WhoPays makes the bill enforce itself.

1. A real price is **crawled** from the public source page (Spotify Premium Family, Nigeria: ₦2,500) and split into per-seat dues.
2. Members join and act **entirely by email**. No account, no password, no app to install. Their email address is their identity.
3. A **scheduler** runs each cycle: at the deadline it evicts the unpaid seat, promotes the next person on the waitlist, closes the cycle and opens the next, all in one transaction.
4. Every board, event, dues notice, and settlement **live-syncs** the instant the backend changes.

The novel thing is not that WhoPays tracks a bill. It is that the bill **acts**: it charges, waits, evicts, and promotes on its own, and you watch it happen on camera.

## How It Works

```
  public price page                 the member                  the scheduler
 (Spotify NG, real)              (email only, no login)         (Convex crons)
        │                               │                             │
        ▼                               ▼                             ▼
  Firecrawl crawl  ──►  priceSnapshot ──► per-seat dues        closeCycleTx (1 mutation)
  (NG geo, 250000 kobo)  sourceUrl+ts        │                   evict → promote →
        │                                    ▼                    close → reopen
        │                            AgentMail dues email              │
        │                                    │                         ▼
        │                            member replies "PAID"      board live-syncs
        │                                    │                   (every screen)
        │                            signed Svix webhook ──► routeInbound ──► seat flips
        │                            (forged POST → 401)      OpenAI reconciles     green
        └──────────────────────────────────────────────────► (out of the kill-shot path)
```

The hero loop (join → evict → promote → dues → reply PAID → seat green) runs with **no login anywhere** and is proven live end to end (`submission/proof.md`).

## Deep Sponsor Integration

Every sponsor is load-bearing: remove it and the product provably breaks. Each ablation sets the sponsor's key invalid, runs a probe, and restores (`submission/proof.md`).

| Sponsor | Role in WhoPays | Load-bearing proof | Ablation result |
|---------|-----------------|--------------------|-----------------|
| **Convex** | The entire spine: schema, realtime board, transactional cycle engine, auth, HTTP router, static hosting | 44 functions; per-plan ownership gates; static SPA served from `*.convex.site` | product has no backend |
| **Firecrawl** | Live NG-geo crawl of the public price page into per-seat dues (`convex/prices.ts`) | real crawl returns `priceKobo: 250000` with `sourceUrl` + timestamp | crawl dies, board holds last snapshot, never fabricates a price |
| **AgentMail** | The member's **entire interface**: dues out, replies in, all through one budget-checked chokepoint (`convex/emailRail.ts`) | real SES send delivered; inbound arrives as a **signed Svix webhook** (`convex/http.ts`); forged POST → 401 | members unreachable, there is no product |
| **OpenAI** (`gpt-4o-mini`) | Reconciles free-text replies and parses forwarded bank alerts into a payment status, degrading to `pending_parse` rather than inventing an amount (`convex/ai.ts`) | real extraction pinned; never fabricates a number | reconciliation dies, deterministic `PAID` pre-classifier keeps the kill-shot intact |

The deterministic `PAID` pre-classifier is deliberate: the on-camera settlement beat never waits on model latency, so OpenAI is proven load-bearing **without** being on the critical path.

## Core Invariants

Each law is enforced by a real code path and produces a named code when the disallowed path is attempted. These are structural, not prose (`INVARIANTS.md`, tests in `tests/`).

- **No fabricated state on any judged surface.** The only member-creating path for demo plans is a real email join; owner-enrollment on a demo plan is rejected with `DEMO_SEATS_JOIN_ONLY`. The seed creates zero members (`npm run audit:realness` prints `seed-created members: 0`).
- **Reconciliation language only.** The payment enum is the closed set `{matched, confirmed, mismatch, pending_parse}`; no stronger word can be represented. The banned-term test fails with `COPY_BANNED_TERM`.
- **Every price traces to a crawl or is labeled owner-entered.** A missing snapshot renders `NO_SNAPSHOT`, never a number. Zero hardcoded naira literals in `src/`.
- **Member emails never rendered publicly.** Every public payload passes `assertNoPii()` (`convex/lib/shared.ts`), which throws `PII_PROJECTION_VIOLATION` on any address-shaped string before the response leaves the server (`npm run audit:pii` → 0 matches).
- **Eviction and promotion are one transaction.** `closeCycleTx` re-reads seat state under Convex optimistic concurrency; a losing concurrent claimer stays waitlist #1 and an event with code `RACE_REFUSED` is appended.
- **Every outbound email passes the budget chokepoint.** All sends funnel through `enqueueSend`; non-critical sends are suppressed at 80/day with `BUDGET_SUPPRESSED`, hard stop at 100.

## Security Architecture

| Layer | Mechanism | Enforcement point |
|-------|-----------|-------------------|
| Owner authorization | Convex Auth (Password); every owner action gated on `getAuthUserId() == plan.ownerUserId` | `convex/plans.ts:10` (`requirePlanOwner`), `convex/plans.ts:208` (`createPlan` → `OWNER_ONLY`) |
| Per-plan IDOR | Tenant B cannot read or mutate tenant A's plan | `scripts/e2e-multitenant.ts` → 7/7 |
| Inbound tenant safety | Public ledger masks inbound reply bodies not provably showcase-attributable | `publicLedgerRow()` guard, `convex/plans.ts` (6/6 live rows masked) |
| Inbox-spoof defense | Public `createPlan` forces `anchorReadOnly:false` + `inboxId:''` server-side | `convex/plans.ts` (attacker spoof neutralized) |
| Webhook authenticity | Inbound email arrives as a Svix-signed webhook; unsigned POST rejected | `convex/http.ts` → forged POST returns 401 |
| PII projection | Address-shaped strings throw before leaving the server | `convex/lib/shared.ts` (`assertNoPii`) |

Full threat matrix in `SECURITY.md`.

## Convex Depth

WhoPays uses Convex as the whole system, not a database:

- **Schema + indexes:** 14 tables (plans, seats, waitlist, cycles, payments, priceSnapshots, events, emailLog, sendBudget, and more) with per-owner and per-email indexes (`convex/schema.ts`).
- **Queries / mutations / actions:** reactive board queries, transactional cycle mutations, sponsor-adapter actions (`convex/plans.ts`, `convex/cycles.ts`, `convex/prices.ts`, `convex/ai.ts`).
- **HTTP actions:** signed AgentMail webhook, `/api/build-info` provenance, `/api/proof` machine-readable proof, static-site catch-all (`convex/http.ts`).
- **Scheduled functions + crons:** one-minute heartbeat driving cycle close, weekly price watch, keep-alive (`convex/crons.ts`).
- **Realtime:** every screen is a live query, so the board updates the instant a mutation lands.
- **File storage:** the production SPA is served from Convex static hosting on `*.convex.site`.
- **Auth:** Convex Auth (Password) for plan owners; members stay email-only.

## Honesty Ledger

Only recompute-stable numbers are pinned; volatile counts are recomputed live and never typed (`docs/pipeline/claims.json`, re-derived by `scripts/verify-claims.ts`).

| Claim | Status | Evidence |
|-------|--------|----------|
| Demo price ₦2,500 (250000 kobo) | VERIFIED, real Firecrawl crawl of the public Spotify NG page | `npm run proof:public` re-derives it from the public page with zero access to our infra |
| Hero loop (join → evict → promote → dues → PAID → green) | VERIFIED live on `beloved-minnow-486` | `submission/proof.md` transcript |
| 4/4 sponsors load-bearing | VERIFIED by ablation | `submission/proof.md` ablation runs |
| Per-plan IDOR enforced | VERIFIED | `scripts/e2e-multitenant.ts` → 7/7 |
| Real payment processing (Paystack/PSP) | NOT BUILT, out of scope by design | `LIMITATIONS.md` |

## Verify in 60 Seconds

The hero price is provable with no access to our infrastructure. The board shows ₦2,500 for the demo plan because that figure is on the public Spotify page right now:

```bash
curl -s https://www.spotify.com/ng/premium/ | grep -c '₦2,500'   # → 2
```

Or run the bundled proof, which re-derives the figure from the live board's `/api/proof` and re-checks it against the public page:

```bash
npm run proof:public     # → PUBLIC PROOF: PASS
```

> Every command above passes from a clean clone with no extra flags.

## Status Legend

Color carries meaning; nothing is decorative (`brand.json`).

| Color | State | Meaning |
|-------|-------|---------|
| Green ink | `active_paid` | Settlement: dues paid, seat secured |
| Amber | `active_unpaid` | Authority / owing: countdown running toward eviction |
| Red ink | `evicted` | Unpaid at cycle close, seat released and waitlist promoted |
| Amber (dashed) | `late_reported` | PAID reported by member, awaiting inbound-email confirmation |
| Grey (hairline) | `empty` | Open seat, join with one email to claim |

## Tests

68/68 passing, `tsc` clean. The suite asserts behavior, not line count:

- **Deterministic core:** money math in kobo, reply top-content stripping, named guard codes.
- **Concurrency:** `race.test.ts` fires two waitlisters at one freed seat, asserts exactly one occupant plus one `RACE_REFUSED` event.
- **Budget:** the 80/100 send thresholds fire.
- **Copy discipline:** `tests/copy.test.ts` scans `src/` and `convex/` for banned payment language and hardcoded prices.
- **Tenant safety + non-fabrication:** `tests/stress/` covers public-ledger masking, parse non-fabrication, and the Convex function layer.

```bash
npm test          # full suite
npm run audit:pii # 0 address-shaped strings in any public payload
```

## Running Locally

```bash
git clone https://github.com/dmustapha/whopays.git
cd whopays
npm install

# Configure your own Convex deployment + sponsor keys
cp .env.example .env.local          # fill in the values (see .env.example)
npx convex dev                      # provisions a dev deployment, pushes functions
npx convex env set FIRECRAWL_API_KEY  <your-key>
npx convex env set AGENTMAIL_API_KEY  <your-key>
npx convex env set OPENAI_API_KEY     <your-key>
npm run seed                        # crawls a real price, creates the demo/anchor boards (zero members)

npm run dev                         # Vite dev server against your deployment
```

Every server-side secret lives in `convex env` (never in the bundle). `.env.local` holds only the deployment URL and is git-ignored.

## Tech Stack

- **Backend:** Convex (schema, queries, mutations, actions, HTTP actions, crons, realtime, Convex Auth, static hosting)
- **Frontend:** Vite + React SPA, hash routing, no member auth
- **Sponsors:** Firecrawl (price crawl), AgentMail (email rail), OpenAI `gpt-4o-mini` (reconciliation)
- **Design:** Solari split-flap departure board. Archivo Narrow + IBM Plex Mono, warm-black board world, amber authority / green-ink settlement / red-ink eviction (`DESIGN_SYSTEM.md`)

## Documentation

- **[`JUDGES.md`](JUDGES.md): start here — every claim as claim → test → keyless receipt, one command to verify**
- **[`hackathon.md`](hackathon.md): the build log judges read — what was built, the stack, the live URL, the demo**
- `DECISIONS.md`: architecture decision records
- `SECURITY.md`: threat matrix and defenses
- `LIMITATIONS.md`: scope boundaries, stated honestly
- `DESIGN_SYSTEM.md`: the Solari design system and tokens
- `DOMAIN-GUIDE.md`: concepts, rules, and glossary
- `submission/proof.md`: the live proof pack and sponsor ablations

## License

MIT, see [LICENSE](LICENSE).
