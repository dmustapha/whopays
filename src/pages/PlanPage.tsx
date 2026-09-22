import Board from "../components/Board";
import EventLog from "../components/EventLog";

export default function PlanPage({ slug }: { slug: string }) {
  return (
    <main>
      <a className="back" href="#/">← all plans</a>
      <Board slug={slug} />
      <EventLog slug={slug} />
    </main>
  );
}
