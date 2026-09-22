import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function EmailLedger() {
  const rows = useQuery(api.plans.getEmailLedger, { limit: 20 });
  if (!rows) return (
    <div className="card" aria-busy="true" aria-label="Loading email ledger">
      <div className="skel-label">Outbound &amp; inbound email</div>
      <div style={{ padding: "10px 0" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skel skel-line" style={{ margin: "12px 0", width: `${80 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
  return (
    <div className="card">
      <h3>Outbound & inbound email ledger</h3>
      <p className="muted">Every email the system sends or receives, in full — so you can see the rail working even before your inbox refreshes. Addresses are redacted at write time.</p>
      {rows.length === 0 && <p className="muted">No email yet — join the board and the ack email lands here.</p>}
      <div className="ledger">
        {rows.map((r: any, i: number) => (
          <details key={`${r.at}-${r.kind}-${i}`} className={`mail ${r.direction}`}>
            <summary>
              <span className="dir">{r.direction === "out" ? "→" : "←"}</span>
              <span className="kind">{r.kind}</span>
              <span className="subj">{r.subject}</span>
              <time>{new Date(r.at).toLocaleTimeString()}</time>
            </summary>
            <pre>{r.bodyText}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}
