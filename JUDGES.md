# For the judges — verify WhoPays in 60 seconds

Everything below is **keyless**. No account, no API key, no admin token. Every claim maps to a test you can run and a receipt you can re-query.

## The one command
```bash
npm install
npm run proof:public
```
Expected output:
```
[derived] board priceKobo=250000 → expect '₦2,500' on the public page
occurrences of ₦2,500 on https://www.spotify.com/ng/premium/: 2
PUBLIC PROOF: PASS
DIFF PROOF: PASS
```
This proves the hero price the app shows is the **real** price on Spotify's public Nigeria page right now — derived live from our public `/api/proof` endpoint and grepped straight off Spotify. Nothing from our infrastructure is trusted; you re-derive it yourself.

## See it live (no login)
- **App:** https://beloved-minnow-486.convex.site — open it, type any email, **Join the Waitlist**. The board updates with no refresh. The demo plan cycles every 3 minutes, so within one cycle you watch the scheduler evict the unpaid seat and promote the next person, then reply **PAID** to the email and your seat turns green.
- **Video walkthrough:** https://youtu.be/dd2wJL17vZk

## Claim → test → receipt

| Claim | Verify it yourself (keyless) | Receipt |
|-------|------------------------------|---------|
| Hero price is real, not typed | `npm run proof:public` | `PUBLIC PROOF: PASS` + 2 hits of ₦2,500 on spotify.com/ng/premium |
| The deployed code == this repo | `curl -s https://beloved-minnow-486.convex.site/api/build-info` | `commit` equals this repo's `git rev-parse HEAD` |
| Prices come from a real crawl (Firecrawl) | `curl -s https://beloved-minnow-486.convex.site/api/proof` | per-plan `sourceUrl` + `priceKobo` + `lastCrawlAt` |
| The scheduler really evicts + promotes | open the app → watch the countdown hit 0, or read the "Last cycle" log | `evicted — dues unpaid` + `promoted into Seat` rows in the event log |
| Members act entirely by email (AgentMail) | join with an email, reply PAID to the dues mail | seat flips green; the in-product email ledger shows both directions |
| The email webhook is authenticated | `curl -X POST https://beloved-minnow-486.convex.site/agentmail/webhook` (unsigned) | `401` (forged/unsigned rejected) |
| No member PII leaks publicly | inspect `/api/proof` and the public board | email addresses are redacted everywhere public |
| Owner actions are access-controlled | try any owner mutation without auth | `OWNER_ONLY` (per-plan ownership, Convex Auth) |
| Sponsors are load-bearing, not decorative | `npx tsx scripts/ablate-firecrawl.ts` / `ablate-agentmail.ts` / `ablate-openai.ts` | each breaks the product when its key is invalidated |
| Tests pass | `npm test` | 68/68 |

## What it does NOT claim
- Payments are only ever **"matched"** — the product never says "verified" or moves real money. The labeled demo plan auto-confirms so you can watch the loop close; a real plan stops at *matched* until the owner confirms.
- The demo plan is clearly badged (`demo plan — replying PAID is the payment · cycles every 3 minutes`). Its dues are ₦0 by design.

Stack: **Convex** (schema, live queries, transactional mutations, scheduler/crons, HTTP actions, Convex Auth, components) · **Firecrawl** (price crawl) · **OpenAI** gpt-4o-mini (plan extraction) · **AgentMail** (email rail).
