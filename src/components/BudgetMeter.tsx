import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function BudgetMeter() {
  const b = useQuery(api.plans.getSendBudget, {});
  if (!b) return (
    <div className="card" aria-busy="true" aria-label="Loading send budget">
      <div className="skel-label">Send budget</div>
      <div style={{ padding: "12px 0 6px" }}>
        <div className="skel skel-line" style={{ height: 10, borderRadius: "var(--r-pill)" }} />
        <div className="skel skel-line" style={{ marginTop: 12, width: "70%" }} />
      </div>
    </div>
  );
  const pct = Math.min(100, Math.round((b.sent / b.cap) * 100));
  return (
    <div className="card budget">
      <h3>Send budget</h3>
      <div className="meter" role="meter" aria-label="emails sent today" aria-valuenow={b.sent} aria-valuemin={0} aria-valuemax={b.cap}>
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted">
        {b.sent}/{b.cap} emails today (free-tier cap; resets 00:00 UTC). Non-critical emails pause at {b.softAt};
        new demo cycles hold back a 10-send reserve.
        {b.suppressing && " Currently suppressing non-critical sends."}
      </p>
    </div>
  );
}
