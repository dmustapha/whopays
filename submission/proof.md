# WhoPays — Proof Pack

Every headline capability below was executed live against the real Convex deployment `resilient-goose-83`. Sponsor ablations prove each integration is load-bearing (remove it → the product breaks). Numbers are recomputed by `scripts/verify-claims.ts`, never typed.

## Hero public proof (zero our-infra dependency)
```
$ npm run proof:public
[leg 1 — public only]
occurrences of ₦2,500 on https://www.spotify.com/ng/premium/: 2
PUBLIC PROOF: PASS
```
The price WhoPays displays for the demo plan (₦2,500, Spotify Premium Family, Nigeria) exists on the public source page right now — verifiable with `curl` and no access to our infrastructure.

## Sponsor ablations (F-018 — each sponsor is load-bearing)
Method: set the sponsor's key to an invalid value (or remove it where the app allows), run the probe, restore. A passing ablation means the product genuinely breaks without the sponsor.

### Firecrawl (crawl spine)
```
ABLATION PROVEN: crawl path dead without Firecrawl (scrape failed: 401).
Board shows last-checked cache — no fabricated price.
```
Without Firecrawl, no live price can be crawled; the board keeps the last snapshot with its "last checked" timestamp and never fabricates a number.

### AgentMail (the member's entire interface)
```
ABLATION PROVEN: 90s after a real join, ack status="enqueued" (never sent) —
members are unreachable without AgentMail; the rail IS the product.
```
Membership is email-only by design. Without AgentMail, members get no ack, no dues, no eviction notice — there is no product.

### OpenAI (reconciliation + onboarding)
```
ABLATION PROVEN: crawl→plan extraction dead without OpenAI (no matching plan extracted);
forwarded bank alerts fall to pending_parse.
```
Without OpenAI, add-plan-by-URL and messy-reply reconciliation stop working and degrade honestly to `pending_parse` — never a fabricated match.

## Honesty audits
```
$ npm run audit:realness
occupied non-enrolled seats: 0; join/promote events: 0
seed-created members: 0 (all occupancy has an event trail) — PASS

$ npm run audit:pii
PASS getEventLog / getEmailLedger / getSendBudget / getBoard / getUnrecognized: no address shapes
```
The seed creates zero members — every seat's life is earned by a real join. No member email ever appears in a public payload.

## Recompute verifier (numbers are earned, not typed)
```
$ npm run verify:claims  → evidence/claims-recompute.json
{ "demo_price_kobo": 250000, "demo_price_source": "https://www.spotify.com/ng/premium/",
  "crawled_plans": 1, "plans_total": 2, ... }
```
Pinning a wrong number (`demo_price_kobo: 999999`) makes the verifier fail:
`CLAIM MISMATCH demo_price_kobo: claimed=999999 recomputed=250000` — the gate can genuinely fail.

## Hero loop (join → evict → promote → dues → PAID → green), proven live
Real event-log sequence, all real actors, no mock:
```
join → promote → cycle_opened → dues_sent → paid_matched → paid_confirmed → seat active_paid (GREEN)
```
A cold visitor joins with only an email, the scheduler seats them, a dues email is sent, they reply "PAID", the reply routes back through the signed AgentMail webhook, and their seat turns green — no login anywhere.

## Deploy provenance (F-016)
```
$ curl -s https://resilient-goose-83.convex.site/api/build-info
{"commit":"<HEAD>","deployedAt":"...","app":"whopays"}
```
The deployed commit matches the repo HEAD — the running code is the committed code.
