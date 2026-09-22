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
      <header className="hero">
        <h1>WhoPays</h1>
        <p className="pitch">
          A live ledger for any bill a group shares. Real prices crawled from the source,
          members run entirely by email, and a scheduler that evicts unpaid seats — live, below.
        </p>
      </header>
      <Board slug="spotify-family-demo" />
      {/* [CRITIQUE E-3] presentational recap of the most recent real cycle consequences */}
      <LastCycleRecap slug="spotify-family-demo" />
      <div className="grid">
        <EventLog slug="spotify-family-demo" />
        <div>
          {anchor && <Board slug={anchor.slug} />}
          <BudgetMeter />
        </div>
      </div>
      <EmailLedger />
      <footer className="muted">
        <a href="#/proof">proof</a> · <a href="https://github.com/dmustapha/whopays" target="_blank" rel="noreferrer">repo</a> ·
        payments are <em>matched</em> from replies and confirmed by the owner — nothing stronger is ever claimed ·
        prices trace to public pages with timestamps · built on Convex + OpenAI + Firecrawl + AgentMail
      </footer>
    </main>
  );
}
