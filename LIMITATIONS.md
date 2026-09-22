# Limitations

## In scope (built for this submission)
- Live seat map, countdown, event log, email ledger, send-budget meter — all live-synced (Convex subscribed queries).
- Email-only membership: join, ack, dues, nag, eviction, promotion, PAID replies, forwarded bank alerts, late-reinstate.
- Crawled prices with provenance (source URL + checked-time) via Firecrawl `location:NG`; weekly re-check + owner "re-crawl now" button + change→recompute→notify; add-any-plan-by-URL with OpenAI extraction. <!-- [CRITIQUE E-1] cadence aligned to PRD F4 (peer-review weekly; daily was pre-adoption text) -->
- Owner console: confirm/reinstate/re-crawl/price-update; unrecognized-reply queue.
- Proof surfaces: /proof, /api/proof, /api/build-info, public-proof.sh, 3 sponsor ablation scripts, realness/PII audits, claims recompute.

## Feature-gated (deliberately not built for this scope)
- Real payment processing (Paystack or any PSP). Reason: out-of-scope by warroom lock — a ledger that "matches, owner confirms" stays honest; processing would drag verification claims and licensing surface in.
- Payment *verification* of any kind. Reason: thesis invariant — we reconcile and the owner confirms; bank-grade verification is not claimable or buildable here.
- Member accounts / auth. Reason: email-only membership IS the product; Convex Auth v2 is super-alpha (organizer-stated) and auth-less submissions are explicitly valid.
- Netflix/Spotify/Starlink account integration. Reason: the app's only external read is public pricing pages, by design and by ToS posture.
- Stranger-matching marketplace (Spliiit-class). Reason: drift tripwire — WhoPays is the ledger for YOUR existing group.
- Mobile apps / React Native. Reason: known Convex RN websocket-recovery issue; web-only in window.
- Multi-currency. Reason: NGN-only demo honesty; the kobo-integer core generalizes later.
- Owner multi-tenancy (many owners, many groups). Reason: single-owner deployment fits the judging window; schema (ownerSessions, per-plan rows) leaves the seam open.
