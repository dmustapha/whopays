import { describe, it, expect } from "vitest";
import { topContent, preClassify, looksLikeBankAlert } from "../convex/lib/parse";
import { parseNairaToKobo, duesPerSeat, normalizeEmail } from "../convex/lib/shared";

describe("topContent", () => {
  it("strips '>' quoted history", () => {
    expect(topContent("PAID\n> On Monday you wrote\n> dues are 2500")).toBe("PAID");
  });
  it("strips 'On ... wrote:' blocks", () => {
    expect(topContent("i don pay\nOn Mon, Sep 22, 2026 someone wrote:\nold text")).toBe("i don pay");
  });
  it("strips forwarded-message separators", () => {
    expect(topContent("see below\n---------- Forwarded Message ----------\nGTB alert")).toBe("see below");
  });
  it("keeps empty result honest", () => {
    expect(topContent("> everything quoted")).toBe("");
  });
});

describe("hero-path determinism (protected invariant — peer review)", () => {
  // The exact on-camera reply "PAID" must resolve WITHOUT any AI call: preClassify decides,
  // routeInbound short-circuits to recordPayment. Regression here = kill-shot depends on OpenAI.
  it("'PAID' resolves deterministically (no needs_ai)", () => {
    expect(preClassify("", "PAID", {})).toBe("paid_claim");
    expect(preClassify("Re: dues", "PAID", {})).toBe("paid_claim");
  });
});

describe("preClassify (ugly-reply corpus E2)", () => {
  const H = {};
  it("PAID", () => expect(preClassify("", "PAID", H)).toBe("paid_claim"));
  it("paid 2500", () => expect(preClassify("", "paid 2500", H)).toBe("paid_claim"));
  it("i don pay", () => expect(preClassify("", "i don pay", H)).toBe("paid_claim"));
  it("PAID in subject only", () => expect(preClassify("PAID", "", H)).toBe("paid_claim"));
  it("empty body + empty subject", () => expect(preClassify("", "", H)).toBe("empty"));
  it("emoji-only goes to AI", () => expect(preClassify("", "👍", H)).toBe("needs_ai"));
  it("auto-submitted guarded", () =>
    expect(preClassify("", "PAID", { "auto-submitted": "auto-replied" })).toBe("auto_reply"));
  it("out-of-office precedence guarded", () =>
    expect(preClassify("Out of office", "I am away", { precedence: "auto_reply" })).toBe("auto_reply"));
  it("forwarded GTB alert flagged for AI + bank heuristic", () => {
    const alert = "Fwd: GTB Transaction Alert — your account has been credited with NGN 2,500.00";
    expect(preClassify("Fwd: alert", alert, H)).toBe("needs_ai");
    expect(looksLikeBankAlert(alert)).toBe(true);
  });
});

describe("money + email helpers", () => {
  it("₦2,500 → 250000 kobo", () => expect(parseNairaToKobo("₦2,500")).toBe(250000));
  it("NGN 2500.50 → 250050", () => expect(parseNairaToKobo("NGN 2500.50")).toBe(250050));
  it("no number → null", () => expect(parseNairaToKobo("thanks!")).toBe(null));
  it("dues ceil", () => expect(duesPerSeat(250000, 6)).toBe(41667));
  it("email normalize", () => expect(normalizeEmail(" A@B.co ")).toBe("a@b.co"));
  it("email reject", () => expect(normalizeEmail("nope")).toBe(null));
});
