import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function EventLog({ slug }: { slug?: string }) {
  const events = useQuery(api.plans.getEventLog, { slug, limit: 40 });
  if (!events) return <div className="card">Loading event log…</div>;
  return (
    <div className="card">
      <h3>Live event log</h3>
      <p className="muted">Append-only. Every row below was caused by a real join, reply, or scheduler run.</p>
      {events.length === 0 && <p className="muted">No events yet — join the board to cause the first row.</p>}
      <ul className="eventlog">
        {events.map((e: any, i: number) => (
          <li key={`${e.at}-${e.type}-${i}`} className={`ev ${e.type}`}>
            <time>{new Date(e.at).toLocaleTimeString()}</time>
            <span>{e.publicText}</span>
            {e.code && <code className="evcode">{e.code}</code>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// [CRITIQUE E-3] "Last cycle" recap — real evict→promote→PAID rows only (NN-1), timestamps visible.
export function LastCycleRecap({ slug }: { slug?: string }) {
  const events = useQuery(api.plans.getEventLog, { slug, limit: 200 });
  if (!events) return null;
  const recap = (events as any[])
    .filter((e) => e.type === "evict" || e.type === "promote" ||
                   e.type === "paid_confirmed" || e.type === "paid_matched")
    .slice(0, 6);
  if (recap.length === 0) return null;
  return (
    <div className="card recap">
      <h3>Last cycle</h3>
      <p className="muted">The most recent real consequences the scheduler ran — evictions, waitlist promotions, and confirmed payments.</p>
      {recap.map((e: any, i: number) => (
        <div key={`${e.at}-${e.type}-${i}`} className="recap-row">
          <time>{new Date(e.at).toLocaleTimeString()}</time>
          <span className={`rt-${e.type === "evict" ? "evict" : e.type === "promote" ? "promote" : "paid"}`}>{e.publicText}</span>
        </div>
      ))}
    </div>
  );
}
