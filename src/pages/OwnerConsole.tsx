import { useState } from "react";
import { useQuery, useMutation, useAction, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

export default function OwnerConsole() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <main className="card console-deck" aria-busy="true">
        <h2>Owner console</h2>
        <div className="skel skel-line" style={{ width: "40%", margin: "12px 0" }} />
      </main>
    );
  }
  if (!isAuthenticated) return <AuthGate />;
  return <Console />;
}

// ---- sign up / sign in (Convex Auth, Password provider) ----
function AuthGate() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="card console-deck">
      <a className="back" href="#/">← board</a>
      <h2>{flow === "signUp" ? "Create your account" : "Owner sign in"}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Create an account to run your own shared bills — you own every plan you make, and add others by email.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setBusy(true);
          try {
            await signIn("password", { email, password, flow });
          } catch (e: any) {
            setErr(flow === "signUp" ? "Couldn't create the account — try a different email or a stronger password." : "Wrong email or password.");
          } finally {
            setBusy(false);
          }
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}
      >
        <input type="email" required placeholder="you@anywhere.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" />
        <input type="password" required placeholder="password (8+ characters)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="password" />
        <button type="submit" disabled={busy}>{busy ? "…" : flow === "signUp" ? "Create account" : "Sign in"}</button>
      </form>
      {err && <p className="joinmsg" style={{ color: "var(--red-ink)", padding: 0 }}>{err}</p>}
      <p className="muted" style={{ marginTop: 14 }}>
        {flow === "signUp" ? "Already have an account?" : "New here?"}{" "}
        <a role="button" tabIndex={0} style={{ cursor: "pointer" }}
           onClick={() => { setFlow(flow === "signUp" ? "signIn" : "signUp"); setErr(null); }}>
          {flow === "signUp" ? "Sign in" : "Create an account"}
        </a>
      </p>
    </main>
  );
}

// ---- authenticated owner console ----
function Console() {
  const { signOut } = useAuthActions();
  const plans = useQuery(api.plans.myPlans, {});
  const queue = useQuery(api.plans.ownerQueue, {});
  const unrecognized = useQuery(api.plans.getUnrecognized, {});
  const confirm = useMutation(api.membership.confirmPayment);
  const reinstate = useMutation(api.membership.reinstate);
  const updatePrice = useMutation(api.plans.updateOwnerPrice);
  const scrape = useAction(api.prices.scrapePlanPrice);
  const [priceEdit, setPriceEdit] = useState<{ planId: string; naira: string }>({ planId: "", naira: "" });
  const [note, setNote] = useState("");

  const origin = window.location.origin;

  return (
    <main>
      <div className="mast" style={{ marginBottom: 4 }}>
        <div className="mark"><span className="glyph" aria-hidden="true" /><h2 style={{ margin: 0 }}>Owner console</h2></div>
        <button onClick={() => signOut()} style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--line)" }}>Sign out</button>
      </div>
      <a className="back" href="#/">← board</a>

      <div className="rail"><span className="rail-label">Create a plan</span></div>
      <div className="card console-deck">
        <AddPlanByUrl onNote={setNote} />
        {note && <p className="muted" style={{ marginTop: 10 }}>{note}</p>}
      </div>

      <div className="rail"><span className="rail-label">Seats needing you</span></div>
      <div className="card console-deck">
        {queue === undefined && <div className="skel skel-line" style={{ width: "50%" }} />}
        {queue && queue.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing waiting — every seat is settled.</p>}
        <ul>
          {queue?.map((q: any) => (
            <li key={q.seatId} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span><strong>{q.planName}</strong> · {q.label} · {q.state === "late_reported" ? "late payment reported" : "owing"}</span>
              {q.state === "late_reported"
                ? <button onClick={() => reinstate({ seatId: q.seatId })}>reinstate</button>
                : <button onClick={() => confirm({ seatId: q.seatId })}>mark paid (owner confirm)</button>}
            </li>
          ))}
        </ul>
      </div>

      <div className="rail"><span className="rail-label">Unrecognized replies</span></div>
      <div className="card console-deck">
        <ul>
          {unrecognized?.map((u: any) => (
            <li key={u._id}><time>{new Date(u.receivedAt).toLocaleTimeString()}</time> — <em>{u.topText.slice(0, 120)}</em></li>
          ))}
          {unrecognized?.length === 0 && <li className="muted">none — every reply matched a seat</li>}
        </ul>
      </div>

      <div className="rail"><span className="rail-label">Your plans</span></div>
      <div className="card console-deck">
        {plans === undefined && <div className="skel skel-line" style={{ width: "60%" }} />}
        {plans && plans.length === 0 && <p className="muted" style={{ margin: 0 }}>No plans yet — create one above, then share its board link to add others.</p>}
        <ul>
          {plans?.map((p: any) => (
            <li key={p._id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{p.name}</strong> <span className="badge muted">{p.kind}</span>
              <a href={`#/plan/${p.slug}`}>open board</a>
              <button onClick={() => { navigator.clipboard?.writeText(`${origin}/#/plan/${p.slug}`); setNote(`Share link copied for "${p.name}" — send it to add others.`); }}
                      style={{ background: "transparent", color: "var(--amber)", border: "1px solid var(--line)" }}>copy invite link</button>
              {p.kind === "crawled" && (
                <button onClick={async () => { const r = await scrape({ planId: p._id }); setNote(JSON.stringify(r)); }}>re-crawl price</button>
              )}
              {p.kind === "ownerEntered" && (
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <input placeholder="new price ₦" value={priceEdit.planId === p._id ? priceEdit.naira : ""}
                    onChange={(e) => setPriceEdit({ planId: p._id, naira: e.target.value })} style={{ width: 110 }} />
                  <button onClick={async () => {
                    const naira = parseFloat(priceEdit.naira);
                    if (!Number.isFinite(naira) || naira <= 0) { setNote("enter a valid price in ₦"); return; }
                    const r = await updatePrice({ planId: p._id, priceKobo: Math.round(naira * 100) });
                    setNote(`price ${r.old} → ${r.next} (owner-updated)`);
                  }}>update</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function AddPlanByUrl({ onNote }: { onNote: (s: string) => void }) {
  const extract = useAction(api.prices.extractFromUrl);
  const createPlan = useMutation(api.plans.createPlan);
  const [url, setUrl] = useState("");
  const [seats, setSeats] = useState("4");
  const [candidates, setCandidates] = useState<Array<{ plan_name: string; priceKobo: number }>>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="muted" style={{ margin: 0 }}>Paste any public pricing page. We crawl the real price; you pick the plan; it goes live with a shareable board link.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="public pricing page URL" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
        <input placeholder="seats" value={seats} onChange={(e) => setSeats(e.target.value)} style={{ width: 70 }} aria-label="seats" />
        <button onClick={async () => {
          onNote("crawling…");
          const r = await extract({ url });
          if (!r.ok) { onNote(`crawl failed: ${r.reason}`); return; }
          const cands = r.candidates ?? [];
          setCandidates(cands); onNote(`${cands.length} plan(s) extracted — pick one`);
        }}>crawl & extract</button>
      </div>
      <ul>
        {candidates.map((c) => (
          <li key={c.plan_name} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {c.plan_name} — ₦{Math.floor(c.priceKobo / 100).toLocaleString()}
            <button onClick={async () => {
              const slug = c.plan_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
              await createPlan({
                slug, name: c.plan_name, kind: "crawled", sourceUrl: url,
                priceKobo: c.priceKobo, seatsTotal: parseInt(seats) || 4, cycleMinutes: 30 * 24 * 60,
                anchorReadOnly: false, inboxId: "",
              });
              onNote(`plan "${c.plan_name}" is live — open Your plans below to copy its invite link`); setCandidates([]);
            }}>add this plan</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
