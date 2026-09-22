// Pure reply-parsing helpers. The AI classifier (convex/ai.ts) runs on TOP CONTENT ONLY,
// produced here. Imports nothing outside convex/lib (dependency-flow law).

// Strip quoted history: keep lines above the first quote marker.
export function topContent(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;                         // "> quoted"
    if (/^On .{5,80}wrote:\s*$/.test(line.trim())) break;  // "On ... wrote:"
    if (/^-{2,}\s*(Original|Forwarded) Message/i.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

// Cheap pre-classification so obvious cases never need an LLM call.
export type PreClass = "paid_claim" | "auto_reply" | "needs_ai" | "empty";

export function preClassify(subject: string, top: string, headers: Record<string, string>): PreClass {
  const h = (k: string) => (headers[k] ?? headers[k.toLowerCase()] ?? "").toLowerCase();
  if (h("auto-submitted").startsWith("auto") || h("precedence") === "auto_reply") return "auto_reply";
  const s = (subject + " " + top).toLowerCase();
  if (top.length === 0 && subject.trim().length === 0) return "empty";
  if (/\bpaid\b|\bi don pay\b|\bpayment (sent|made|done)\b/i.test(s)) return "paid_claim";
  return "needs_ai";
}

// FINDING-8 fix: AgentMail's from_ may arrive as `Name <a@b.com>` — always extract the bare address.
export function extractAddress(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

export function looksLikeBankAlert(top: string): boolean {
  return /credit alert|transaction alert|acct|account.{0,20}credited|GTB|Kuda|Access Bank|Zenith|UBA|OPay/i.test(top);
}
