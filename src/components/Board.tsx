import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id); // FINDING-7: no timer leak under StrictMode
  }, []);
  const ms = Math.max(0, deadline - now);
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return <div className="countdown" aria-live="polite">{m}:{String(s).padStart(2, "0")}<span> until cycle closes</span></div>;
}

export default function Board({ slug }: { slug: string }) {
  const board = useQuery(api.plans.getBoard, { slug });
  const join = useMutation(api.membership.joinWaitlist);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // SOLARI signature: when a seat's real state changes (evict/promote/paid), flap it.
  const prevStates = useRef<Record<string, string>>({});
  const [flipping, setFlipping] = useState<Record<string, boolean>>({});
  const seatList: any[] = (board && board !== null ? (board as any).seats : []) ?? [];
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const s of seatList) {
      const was = prevStates.current[s._id];
      if (was !== undefined && was !== s.state) next[s._id] = true;
      prevStates.current[s._id] = s.state;
    }
    if (Object.keys(next).length) {
      setFlipping((f) => ({ ...f, ...next }));
      const ids = Object.keys(next);
      const t = setTimeout(() => setFlipping((f) => {
        const c = { ...f }; ids.forEach((id) => delete c[id]); return c;
      }), 600);
      return () => clearTimeout(t);
    }
  }, [seatList.map((s) => `${s._id}:${s.state}`).join(",")]);

  if (board === undefined) return (
    <div className="board card" aria-busy="true" aria-label="Loading the live board">
      <div className="skel skel-head" />
      <div className="skel-seatgrid">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel skel-seat" />)}
      </div>
    </div>
  );
  if (board === null) return <div className="card">No such plan.</div>;
  const { plan, seats, waitlistCount, cycle, snapshot, duesDisplay } = board as any;

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const r = await join({ slug, email });
      setMsg(`You're #${r.position} in line. Check your inbox (and spam) for your confirmation.`);
      setEmail("");
    } catch (err: any) {
      const code = String(err?.message ?? "");
      if (code.includes("JOIN_RATE_LIMITED")) setMsg("That address hit today's join limit (2/day).");
      else if (code.includes("ALREADY_ON_PLAN")) setMsg("That address is already seated or in line on this plan.");
      else if (code.includes("ANCHOR_READ_ONLY")) setMsg("This board is read-only — it's the owner's real household plan.");
      else setMsg("Couldn't join — check the email address.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="board card">
      <div className="board-head">
        <h2>{plan.name}</h2>
        {plan.demoLabel && <span className="badge demo">{plan.demoLabel}</span>}
        {plan.anchorReadOnly && <span className="badge anchor">owner's real plan · read-only</span>}
      </div>
      {cycle && <Countdown deadline={cycle.deadline} />}
      {!cycle && plan.isDemo && (
        // [CRITIQUE E-3] idle-state copy — real events only, presentational
        <p className="idle" aria-live="polite">
          join to start the next cycle — a full month runs in 3 minutes
        </p>
      )}
      {!cycle && plan.anchorReadOnly && (
        <p className="muted">Real household bill · read-only board — no live cycle running.</p>
      )}
      <div className="price-line">
        {!snapshot || typeof snapshot !== "object" || "code" in snapshot || snapshot.priceDisplay == null ? (
          <span className="badge muted">price pending crawl</span>
        ) : (
          <span>
            {snapshot.priceDisplay}/cycle · dues {duesDisplay ?? "—"} ·{" "}
            <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">source</a>{" "}
            <time className="muted">checked {new Date(snapshot.scrapedAt).toLocaleTimeString()}</time>
            {snapshot.origin === "owner_update" && <span className="badge muted">owner-entered</span>}
          </span>
        )}
      </div>
      <div className="seats" role="list">
        {seats.map((s: any) => {
          const occupied = s.state !== "evicted" && s.joinedAt != null;
          const empty = !occupied && s.state === "active_unpaid" && s.joinedAt == null;
          return (
            <div key={s._id} role="listitem" className={`seat ${s.state}${empty ? " empty" : ""}${flipping[s._id] ? " flip" : ""}`}>
              <span className="seat-label">{s.displayLabel}</span>
              <span className="seat-state">
                {empty && "empty — join to claim"}
                {!empty && s.state === "active_paid" && "paid ✓"}
                {!empty && s.state === "active_unpaid" && "owing"}
                {!empty && s.state === "evicted" && "evicted"}
                {!empty && s.state === "late_reported" && "late — owner reviewing"}
              </span>
            </div>
          );
        })}
      </div>
      {!plan.anchorReadOnly && (
        <form className="join" onSubmit={onJoin}>
          <input type="email" required placeholder="you@anywhere.com" value={email}
            onChange={(e) => setEmail(e.target.value)} aria-label="email to join the waitlist" />
          <button type="submit" disabled={busy}>{busy ? "Joining…" : "Join the waitlist"}</button>
          <span className="muted">{waitlistCount} in line · no signup, everything happens by email</span>
        </form>
      )}
      {msg && <p className="joinmsg">{msg}</p>}
    </div>
  );
}
