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
          <span className="glyph" aria-hidden="true" />
          <div>
            <h1>WhoPays</h1>
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
