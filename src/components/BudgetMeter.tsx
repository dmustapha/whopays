import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function BudgetMeter() {
  const b = useQuery(api.plans.getSendBudget, {});
  if (!b) return <div className="card">Loading send budget…</div>;
  const pct = Math.min(100, Math.round((b.sent / b.cap) * 100));
  return (
    <div className="card budget">
      <h3>Send budget</h3>
      <div className="meter" role="meter" aria-valuenow={b.sent} aria-valuemax={b.cap}>
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
