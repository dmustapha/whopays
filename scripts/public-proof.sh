#!/usr/bin/env bash
# Hero public proof: the price WhoPays displays exists on the PUBLIC source page right now.
# Leg 1 needs NOTHING from our infra. Leg 2 (optional) diffs our API against the public page.
set -euo pipefail

PUBLIC_URL="https://www.spotify.com/ng/premium/"
EXPECT="₦2,500"

echo "[leg 1 — public only]"
COUNT=$(curl -sL --max-time 30 -A "Mozilla/5.0" "$PUBLIC_URL" | grep -c "$EXPECT" || true)
echo "occurrences of $EXPECT on $PUBLIC_URL: $COUNT"
[ "$COUNT" -ge 1 ] && echo "PUBLIC PROOF: PASS" || { echo "PUBLIC PROOF: FAIL"; exit 1; }

if [ -n "${SITE_HOST:-}" ]; then
  echo "[leg 2 — diff against our /api/proof]"
  OURS=$(curl -s "https://${SITE_HOST}/api/proof" | grep -o '"priceKobo":[0-9]*' | head -1 | grep -o '[0-9]*')
  echo "our displayed priceKobo: ${OURS:-none} (expect 250000)"
  [ "${OURS:-0}" = "250000" ] && echo "DIFF PROOF: PASS" || { echo "DIFF PROOF: FAIL"; exit 1; }
fi
