import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function OwnerConsole() {
  const [token, setToken] = useState<string>(sessionStorage.getItem("ownerToken") ?? "");
  const [secret, setSecret] = useState("");
  const login = useMutation(api.plans.ownerLogin);
  const plans = useQuery(api.plans.listPlans, {});
  const board = useQuery(api.plans.getBoard, { slug: "spotify-family-demo" });
  const confirm = useMutation(api.membership.confirmPayment);
  const reinstate = useMutation(api.membership.reinstate);
  const updatePrice = useMutation(api.plans.updateOwnerPrice);
  const scrape = useAction(api.prices.scrapePlanPrice);
  const unrecognized = useQuery(api.plans.getUnrecognized, token ? { ownerToken: token } : "skip");
  const [priceEdit, setPriceEdit] = useState<{ planId: string; naira: string }>({ planId: "", naira: "" });
  const [note, setNote] = useState("");

  if (!token) {
    return (
      <main className="card">
        <h2>Owner console</h2>
        <form onSubmit={async (e) => { e.preventDefault();
          try { const r = await login({ secret }); sessionStorage.setItem("ownerToken", r.token); setToken(r.token); }
          catch { setNote("Wrong secret."); } }}>
          <input type="password" placeholder="owner secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button type="submit">Enter</button>
        </form>
        <p className="muted">{note}</p>
        <a className="back" href="#/">← board</a>
      </main>
    );
  }

  return (
    <main>
      <a className="back" href="#/">← board</a>
      <div className="card">
        <h2>Owner console</h2>
        <h3>Seats needing you</h3>
        <ul>
          {(board as any)?.seats?.filter((s: any) => s.state === "late_reported").map((s: any) => (
            <li key={s._id}>{s.displayLabel} reported a late payment
              <button onClick={() => reinstate({ ownerToken: token, seatId: s._id })}>reinstate</button></li>
          ))}
          {(board as any)?.seats?.filter((s: any) => s.state === "active_unpaid").map((s: any) => (
            <li key={s._id}>{s.displayLabel} owing
              <button onClick={() => confirm({ ownerToken: token, seatId: s._id })}>mark paid (owner confirm)</button></li>
          ))}
        </ul>
        <h3>Unrecognized replies</h3>
        <ul>
          {unrecognized?.map((u: any) => (
            <li key={u._id}><time>{new Date(u.receivedAt).toLocaleTimeString()}</time> — <em>{u.topText.slice(0, 120)}</em></li>
          ))}
          {unrecognized?.length === 0 && <li className="muted">none — every reply matched a seat</li>}
        </ul>
        <h3>Add a plan by URL</h3>
        <AddPlanByUrl token={token} onNote={setNote} />
        <h3>Plans</h3>
        <ul>
          {plans?.map((p: any) => (
            <li key={p._id}>
              {p.name} — {p.kind}
              {p.kind === "crawled" && (
                <button onClick={async () => { const r = await scrape({ planId: p._id, ownerToken: token }); setNote(JSON.stringify(r)); }}>
                  re-crawl price now
                </button>
              )}
              {p.kind === "ownerEntered" && (
                <span>
                  <input placeholder="new price ₦" value={priceEdit.planId === p._id ? priceEdit.naira : ""}
                    onChange={(e) => setPriceEdit({ planId: p._id, naira: e.target.value })} />
                  <button onClick={async () => {
                    const naira = parseFloat(priceEdit.naira);
                    if (!Number.isFinite(naira) || naira <= 0) { setNote("enter a valid price in ₦"); return; }
                    const kobo = Math.round(naira * 100);
                    const r = await updatePrice({ ownerToken: token, planId: p._id, priceKobo: kobo });
                    setNote(`price ${r.old} → ${r.next} (owner-updated)`); }}>
                    update price
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="muted">{note}</p>
      </div>
    </main>
  );
}

function AddPlanByUrl({ token, onNote }: { token: string; onNote: (s: string) => void }) {
  const extract = useAction(api.prices.extractFromUrl);
  const createPlan = useMutation(api.plans.createPlan);
  const [url, setUrl] = useState("");
  const [seats, setSeats] = useState("4");
  const [candidates, setCandidates] = useState<Array<{ plan_name: string; priceKobo: number }>>([]);
  return (
    <div>
      <input placeholder="public pricing page URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input placeholder="seats" value={seats} onChange={(e) => setSeats(e.target.value)} style={{ width: 60 }} />
      <button onClick={async () => {
        onNote("crawling…");
        const r = await extract({ url, ownerToken: token });
        if (!r.ok) { onNote(`crawl failed: ${r.reason}`); return; }
        const cands = r.candidates ?? [];
        setCandidates(cands); onNote(`${cands.length} plan(s) extracted — pick one`);
      }}>crawl & extract</button>
      <ul>
        {candidates.map((c) => (
          <li key={c.plan_name}>
            {c.plan_name} — {"₦"}{Math.floor(c.priceKobo / 100).toLocaleString()}
            <button onClick={async () => {
              const slug = c.plan_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
              await createPlan({
                ownerToken: token, slug, name: c.plan_name, kind: "crawled", sourceUrl: url,
                priceKobo: c.priceKobo, seatsTotal: parseInt(seats) || 4, cycleMinutes: 30 * 24 * 60,
                isDemo: false, autoConfirm: false, anchorReadOnly: false,
                inboxId: "", demoLabel: undefined,
              });
              onNote(`plan "${c.plan_name}" is live with the crawled price`); setCandidates([]);
            }}>add this plan</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
