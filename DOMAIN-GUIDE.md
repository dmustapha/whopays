# DOMAIN-GUIDE — WhoPays

The domain-knowledge map for WhoPays: a shared-plan dues ledger with an email membership rail and crawl-driven prices. Every concept below cites the code it lives in and the spec it came from. Reconciliation language only — WhoPays **matches** payments and the owner **confirms**; it never "verifies".

---

## Concepts

| # | Concept | What it means |
|---|---------|---------------|
| 1 | **Plan** | A shared subscription or bill (household plan, official Extra-Member seat, or non-subscription bill) with a seat count, a price snapshot, and a cycle length. The unit everything else hangs off.
| 2 | **Seat** | One slot in a plan. Holds `SeatState` (`active_paid`/`active_unpaid`/`evicted`/`late_reported`) and a private `memberEmail` never projected to public queries.
| 3 | **Waitlist (FIFO)** | Ordered queue of would-be members for a full plan. First in line is promoted when a seat frees. No cutting — order is the fairness guarantee.
| 4 | **Cycle (open → closed)** | A billing period for a plan (`cycleMinutes`: demo = 3 min, anchor = monthly — a real labeled setting, never a hidden fast-forward, D-7). Opening sets dues; closing runs the kill-shot (eviction + promotion).
| 5 | **Dues (ceil split)** | Per-seat amount = price ÷ occupied seats, rounded **up** to the kobo so the group never under-collects. Stored as `cycles.duesKobo`.
| 6 | **Eviction** | An `active_unpaid` seat is vacated at cycle close. Emits an `evict` event and a critical eviction email.
| 7 | **Promotion** | Waitlist #1 fills a freed seat in the SAME transaction as the eviction — a seat can never double-fill. Emits `promote` + a critical promotion email. | the invariant,|
| 8 | **Reconciliation ("matched", never "verified")** | A forwarded bank alert is **matched** to a seat's expected dues; status becomes `matched` and the owner **confirms**. The payment enum has no member stronger than `confirmed`. | the invariant, core design inv. 1; `convex/lib/shared.ts` `PaymentStatus` |
| 9 | **Owner confirm** | The human backstop. After a match, the owner confirms (or flags mismatch). WhoPays never auto-credits a payment; a wrong-sender claim goes to the owner queue. | the invariant, D-9; `convex/emailRail.ts` |
| 10 | **Price snapshot (provenance)** | Every displayed price is a `priceSnapshots` row carrying `sourceUrl` + `scrapedAt`, or an `ownerEntered` plan with an "owner-entered" badge + source link. Missing snapshot → `NO_SNAPSHOT` token, never a number. | the invariant, core design inv. 3; `convex/schema.ts` `priceSnapshots`, `convex/prices.ts` |
| 11 | **Send budget (80/100)** | AgentMail free-tier cap. Non-critical sends are suppressed at 80/day (`BUDGET_SUPPRESSED`); hard stop at 100. Every send goes through the single `enqueueSend` chokepoint. | the invariant; `convex/emailRail.ts`, `convex/lib/shared.ts` `LIMITS` |
| 12 | **Demo plan (labeled, ₦0, autoConfirm)** | The `spotify-family-demo` plan. Labeled `isDemo`, member-free until real joins, activity-gated cycles. Owner-enrollment is structurally rejected (`DEMO_SEATS_JOIN_ONLY`) — the only way a demo seat fills is a real email join. | the invariant, the realness rule; `convex/membership.ts`, `scripts/seed-demo.ts` |
| 13 | **Anchor plan (read-only, owner-enrolled)** | A real household bill the owner enrolls into, with anonymous seat labels and an "owner-enrolled" badge. Read-only so no fabricated friend identities appear (D-8). | D-8; `convex/plans.ts` |
| 14 | **Unrecognized queue** | Inbound emails whose sender doesn't match a seat, or whose text can't be parsed, land in the owner's queue as `pending_parse` — never auto-credited, never silently dropped. | the invariant, safety layer 3; `convex/emailRail.ts` |
| 15 | **Email rail** | The member's complete interface. Join ack, dues, pay-report, eviction, promotion — all actionable purely through email. The web board is a live mirror, never a required member surface. | the invariant; `convex/emailRail.ts` |

---

## Business rules — the 7 NON-NEGOTIABLES (verbatim from INVARIANTS.md)

1. **No fabricated state on any judged surface.** Every seat, waitlist entry, event, payment, and email-ledger row traces to a real mutation caused by a real actor. `seed-demo.ts` creates plans and inboxes ONLY — zero members, zero waitlist rows, zero events. The only member-creating path for demo plans is the public `joinWaitlist` mutation; owner-enrollment is structurally rejected on `isDemo` plans with code `DEMO_SEATS_JOIN_ONLY`.
2. **Reconciliation language only — "matched", never anything stronger.** The payment status enum is the closed set `{matched, confirmed, mismatch, pending_parse}`. Crawl freshness badge says "last checked HH:MM". The banned-term test fails CI with `COPY_BANNED_TERM`.
3. **Every displayed price traces to a crawl or is labeled owner-entered.** UI renders prices exclusively from `priceSnapshots` (sourceUrl + scrapedAt) or `ownerEntered` plans with an "owner-entered" badge + source link. A missing snapshot renders `NO_SNAPSHOT`, never a number.
4. **Member emails never rendered publicly.** Public query results return display labels and hashed identifiers only. Bodies redact addresses to `[redacted inbox]`. Every public payload passes `assertNoPii()`, which throws `PII_PROJECTION_VIOLATION` on any address-shaped string.
5. **Eviction + promotion is one transaction — a seat can never double-fill.** `closeCycleTx` re-reads seat state inside the mutation (Convex OCC); the losing concurrent claimer stays waitlist #1 and a `RACE_REFUSED` event is appended.
6. **No login-sharing or circumvention anywhere in product copy.** No credential field exists anywhere in the schema (structurally unrepresentable). Copy names official seat types; a violation grep fails CI with `COPY_BANNED_TERM`.
7. **Every outbound email passes the budget chokepoint.** All sends go through the single `enqueueSend` wrapper; non-critical sends suppressed at 80/day (`BUDGET_SUPPRESSED`); hard stop at 100.

*(Invariant 8 — "the email rail is the member's complete interface" — is captured as concept #15 above.)*

### LIMITS (from `convex/lib/shared.ts`)

| Constant | Value | Meaning |
|----------|-------|---------|
| `DAILY_SEND_CAP` | 100 | AgentMail free-tier hard cap |
| `SOFT_SUPPRESS_AT` | 80 | Non-critical sends suppressed from here |
| `JOINS_PER_ADDRESS_PER_DAY` | 2 | Per-address join flood guard |
| `PRICE_MIN_KOBO` | 500_00 (₦500) | Lower price sanity bound |
| `PRICE_MAX_KOBO` | 50_000_00 (₦50,000) | Upper price sanity bound |
| `DEMO_ACTIVITY_WINDOW_MS` | 30 min | Demo cycles run only if a join/reply happened within this window |
| `DEMO_EMAIL_FRESHNESS_MS` | 60 min | Demo-plan emails go only to seats active within this window |
| `CYCLE_ADMISSION_RESERVE` | 10 | Never open a cycle whose projected sends leave <10 headroom |

Critical send kinds (still send in the 80–100 window): `dues`, `eviction`, `promotion`, `ack`. Non-critical (suppressed at 80): `nag`, `price_changed`.

---

## Glossary — domain → code

| Domain term | Code location |
|-------------|---------------|
| dues | `cycles.duesKobo` |
| seat state | `SeatState` (`convex/lib/shared.ts`) |
| matched | `PaymentStatus` value `"matched"` |
| price provenance | `priceSnapshots.origin` (`sourceUrl` + `scrapedAt`) |
| budget | `sendBudget` (chokepoint: `emailRail.enqueueSend`) |
| kill-shot (eviction + promotion) | `cycles.closeCycle` / `closeCycleTx` |
| owner session | `plans.ownerLogin` → server-side token |
| no-price token | `NO_SNAPSHOT` |
| race refusal | event code `RACE_REFUSED` |
| budget suppression | event code `BUDGET_SUPPRESSED` |
| demo seat guard | code `DEMO_SEATS_JOIN_ONLY` |
| PII guard | `assertNoPii()` → throws `PII_PROJECTION_VIOLATION` |

---

## Source mapping
