// STRESS DH-6 — public-ledger tenant-safety falsification suite.
// Claim: the public Landing email ledger never exposes a private tenant's inbound reply body.
// Feed a lie (a private inbound row) and assert the public projection masks it (assertRed).
import { describe, it, expect } from "vitest";
import { publicLedgerRow } from "../../convex/lib/shared";

const SHOWCASE = new Set(["demo1", "anchor1"]);
const isShowcase = (id: string | null | undefined) => id != null && SHOWCASE.has(id);

const base = {
  at: 1, kind: "reply", subject: "Re: your Lagos flat WiFi share",
  bodyText: "I paid my ₦8,000 share for the private flat — see attached", counterpartyRedacted: "[redacted inbox]",
  status: null as string | null,
};

describe("DH-6 public ledger tenant safety", () => {
  it("MASKS a private-plan inbound reply body (planId not in showcase)", () => {
    const out = publicLedgerRow({ ...base, direction: "in", planId: "private-tenant-42" }, isShowcase);
    expect(out.bodyText).not.toContain("₦8,000");
    expect(out.bodyText).not.toContain("private flat");
    expect(out.subject).not.toContain("Lagos");
    expect(out.bodyText).toBe("(reply content is visible to the plan owner)");
  });

  it("MASKS an unattributed inbound reply body (planId null — the real production shape)", () => {
    const out = publicLedgerRow({ ...base, direction: "in", planId: null }, isShowcase);
    expect(out.bodyText).toBe("(reply content is visible to the plan owner)");
    expect(out.subject).toBe("(reply received)");
  });

  it("MASKS an unattributed inbound reply body (planId undefined)", () => {
    const out = publicLedgerRow({ ...base, direction: "in" }, isShowcase);
    expect(out.bodyText).toBe("(reply content is visible to the plan owner)");
  });

  it("SHOWS a showcase-plan inbound reply body in full (demo path must stay visible)", () => {
    const out = publicLedgerRow({ ...base, direction: "in", planId: "demo1" }, isShowcase);
    expect(out.bodyText).toContain("₦8,000");
    expect(out.subject).toContain("Lagos");
  });

  it("SHOWS outbound rows in full regardless of null planId (system sends signal the rail)", () => {
    const out = publicLedgerRow({ ...base, direction: "out", kind: "dues", subject: "Your dues: ₦2,500", bodyText: "Spotify Family dues", planId: null }, isShowcase);
    expect(out.bodyText).toBe("Spotify Family dues");
    expect(out.subject).toBe("Your dues: ₦2,500");
  });

  it("still signals a reply arrived (bidirectional rail) even when masked", () => {
    const out = publicLedgerRow({ ...base, direction: "in", planId: null }, isShowcase);
    expect(out.direction).toBe("in");
    expect(out.kind).toBe("reply");
    expect(out.counterparty).toBe("[redacted inbox]");
  });

  it("preserves the outbound delivery status the ledger renders (F-012)", () => {
    const out = publicLedgerRow({ ...base, direction: "out", kind: "dues", status: "delivered", planId: "demo1" }, isShowcase);
    expect(out.status).toBe("delivered");
  });
});
