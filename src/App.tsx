import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import PlanPage from "./pages/PlanPage";
import OwnerConsole from "./pages/OwnerConsole";
import ProofPage from "./pages/ProofPage";

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();
  if (hash.startsWith("#/plan/")) return <PlanPage slug={hash.slice("#/plan/".length)} />;
  if (hash.startsWith("#/owner")) return <OwnerConsole />;
  if (hash.startsWith("#/proof")) return <ProofPage />;
  return <Landing />;
}
