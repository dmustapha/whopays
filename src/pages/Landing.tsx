import Board from "../components/Board";
import EventLog, { LastCycleRecap } from "../components/EventLog";
import EmailLedger from "../components/EmailLedger";
import BudgetMeter from "../components/BudgetMeter";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Landing() {
  const plans = useQuery(api.plans.listPlans, {});
  const anchor = plans?.find((p: any) => p.anchorReadOnly);
  return (
    <main>
      <header className="mast hero">
        <div className="mark">
          <div>
            <h1 className="brand" aria-label="WhoPays">
              <svg className="brandmark" viewBox="0 0 420 108" role="img" aria-label="WhoPays">
                <rect x="8" y="20" width="60" height="60" rx="10" fill="#0e0e10" stroke="#2a2a30" strokeWidth="3" />
                <rect x="19" y="35" width="38" height="6" rx="2" fill="#f0a92e" />
                <rect x="19" y="59" width="38" height="6" rx="2" fill="#57b06f" />
                <line x1="8" y1="50" x2="68" y2="50" stroke="#000000" strokeWidth="2.5" opacity="0.7" />
                <text x="90" y="62" fontFamily="'Archivo Narrow','Arial Narrow',sans-serif" fontWeight="700" fontSize="46" letterSpacing="4" fill="#f4f1ea" style={{ textTransform: "uppercase" }}>WHOPAYS</text>
                <line x1="92" y1="80" x2="228" y2="80" stroke="#f0a92e" strokeWidth="4" strokeLinecap="round" />
                <line x1="236" y1="80" x2="352" y2="80" stroke="#57b06f" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </h1>
            <p className="pitch">
              A live board for any bill a group shares. Real prices crawled from the source,
              members run entirely by email, and a scheduler that evicts the unpaid seat and
              promotes the next in line — on a clock, in public.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <span className="livechip">Departures · Live</span>
          <a href="#/owner" className="badge demo" style={{ padding: "7px 12px", fontSize: ".72rem" }}>
            Run your own bill →
          </a>
        </div>
      </header>
      <Board slug="spotify-family-demo" />
      {/* [CRITIQUE E-3] presentational recap of the most recent real cycle consequences */}
      <LastCycleRecap slug="spotify-family-demo" />
      <div className="grid">
        <div>
          <div className="rail"><span className="rail-label">Ledger · live event log</span></div>
          <EventLog slug="spotify-family-demo" />
        </div>
        <div>
          {anchor && (
            <>
              <div className="rail"><span className="rail-label">Anchor · owner's real bill</span></div>
              <Board slug={anchor.slug} />
            </>
          )}
          <div className="rail"><span className="rail-label">Send budget</span></div>
          <BudgetMeter />
        </div>
      </div>
      <div className="rail"><span className="rail-label">Email · outbound &amp; inbound</span></div>
      <EmailLedger />
      <footer>
        <a href="#/proof">proof</a> · <a href="https://github.com/dmustapha/whopays" target="_blank" rel="noreferrer">repo</a> ·
        payments are <em>matched</em> from replies and confirmed by the owner — nothing stronger is ever claimed ·
        prices trace to public pages with timestamps · built on Convex + OpenAI + Firecrawl + AgentMail
      </footer>
    </main>
  );
}
