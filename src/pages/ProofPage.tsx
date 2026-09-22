import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function ProofPage() {
  const board = useQuery(api.plans.getBoard, { slug: "spotify-family-demo" });
  const snap: any = board?.snapshot ?? null;
  const figure = snap && !("code" in snap) ? snap.priceDisplay : null;
  const source = snap && !("code" in snap) ? snap.sourceUrl : null;

  // F-016: deploy provenance — read the deployed git commit from /api/build-info.
  const [build, setBuild] = useState<{ commit?: string; builtAt?: string } | null>(null);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/build-info")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setBuild(j))
      .catch((e) => setBuildErr(String(e?.message ?? e)));
  }, []);

  return (
    <main className="card">
      <h2>Prove it yourself</h2>
      <ol>
        <li>Every price on the board links its public source page and crawl timestamp.</li>
        <li><code>GET /api/proof</code> on this domain returns each plan's price + source URL as JSON.</li>
        <li>Re-derive the hero figure with no access to our infra:<br />
          {figure && source
            ? <code>curl -s {source} | grep -c "{figure}"</code>
            : <span className="muted">price pending crawl — run the owner re-crawl first</span>} → ≥1</li>
        <li><code>GET /api/build-info</code> returns the deployed git commit — compare with the public repo HEAD.
          {build?.commit && <> Currently deployed: <code>{build.commit}</code>{build.builtAt && <> · built {new Date(build.builtAt).toLocaleString()}</>}.</>}
          {buildErr && <span className="muted"> (build-info unavailable in dev: {buildErr})</span>}
        </li>
        <li>The event log and email ledger on the landing page are append-only records of real scheduler runs and real emails — join the demo plan and cause your own rows.</li>
      </ol>
      <p className="muted">Payments are matched from email replies and confirmed by the plan owner — the app claims nothing stronger. WhoPays never touches any provider's systems; its only external read is public pricing pages.</p>
      <a className="back" href="#/">← board</a>
    </main>
  );
}
