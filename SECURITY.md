# SECURITY — WhoPays threat model

WhoPays holds no money, no passwords, and no provider credentials. Its authority is over one group's own ledger. The defenses below each map to the code that enforces them; the `## Not defended against` section names what is deliberately out of scope — that boundary is the honesty signal, not a gap.

## Defense-in-depth layers
- **Layer 1 — Input validation:** `normalizeEmail` + price-range guards (`convex/lib/shared.ts`) in every public mutation; React escapes all output.
- **Layer 2 — Rate limiting:** join limit 2/address/day; per-plan seat caps; send-budget 80/100 chokepoint (`convex/emailRail.ts`).
- **Layer 3 — Circuit behavior:** crawl failure → keep-cache + honest event; OpenAI failure → `pending_parse`; webhook outage → 60s poll fallback.
- **Layer 4 — Graceful degrade:** board renders `NO_SNAPSHOT`/pending states; email-rail status is visible; nothing blanks, nothing fabricates.

## Threat matrix
| Threat | Enforcement | File |
|---|---|---|
| Fabricated board state | `DEMO_SEATS_JOIN_ONLY` guard + seed-creates-no-members | convex/membership.ts, scripts/seed-demo.ts |
| PII leak via public queries | allowlist projection + write-time redaction + `assertNoPii()` | convex/plans.ts, convex/lib/shared.ts, convex/schema.ts |
| Owner-console takeover | `OWNER_SECRET` login → server-side session tokens | convex/plans.ts |
| Email-loop amplification | Auto-Submitted/Precedence guard + budget chokepoint | convex/lib/parse.ts, convex/emailRail.ts |
| Join flooding | joinRates 2/day/address + seat caps | convex/membership.ts |
| Reply spoofing (wrong sender claims PAID) | exact seat-email match; unknown → owner queue, never auto-credit | convex/emailRail.ts |

## Not defended against
- **Sophisticated email spoofing of a known member address** — SPF/DKIM validation is AgentMail-side; our human backstop is that payment status is `matched` and the owner confirms, never `verified`.
- **A malicious owner** — the owner is the trust anchor by design; WhoPays governs the group's ledger, not the owner.
- **DDoS beyond Convex platform limits** — mitigated only to the extent the Convex platform provides.
- **A member forwarding a fabricated bank alert** — this is exactly *why* a reported payment is `matched, owner confirms` and never `verified`; we never assert a payment happened on the strength of a parsed email alone.
