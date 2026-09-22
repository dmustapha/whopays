// STRESS DH-5 / DH-6 / DH-1 — Convex query/mutation layer behavioral tests against the REAL
// functions (convex-test in-memory), closing the "integration-tested-live-only" coverage gap.
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("./../../convex/**/*.*s");

async function seedPlan(t: any, over: Record<string, any> = {}) {
  return await t.run(async (ctx: any) =>
    ctx.db.insert("plans", {
      slug: over.slug ?? "p-" + Math.random().toString(36).slice(2, 7),
      name: over.name ?? "Plan", kind: "crawled", priceKobo: 250000, currency: "NGN" as const,
      seatsTotal: 3, cycleMinutes: 3, isDemo: false, autoConfirm: false,
      anchorReadOnly: false, inboxId: "", ...over,
    }));
}

describe("DH-6 getEmailLedger tenant safety (real query)", () => {
  it("masks a private-tenant inbound reply body but shows showcase outbound in full", async () => {
    const t = convexTest(schema, modules);
    const demo = await seedPlan(t, { slug: "spotify-family-demo", name: "Spotify Family", isDemo: true });
    const priv = await seedPlan(t, { slug: "lagos-flat", name: "Lagos Flat WiFi" });
    await t.run(async (ctx: any) => {
      // outbound dues on the showcase plan → must render fully (F-012)
      await ctx.db.insert("emailLog", { planId: demo, direction: "out", kind: "dues",
        counterpartyRedacted: "[redacted inbox]", subject: "Your dues: ₦2,500", bodyText: "Spotify Family dues ₦2,500", at: 3, status: "delivered" });
      // inbound reply routed to a PRIVATE plan (planId set) → must be filtered out entirely
      await ctx.db.insert("emailLog", { planId: priv, direction: "in", kind: "reply",
        counterpartyRedacted: "[redacted inbox]", subject: "Re: Lagos Flat WiFi", bodyText: "I paid my ₦8,000 share for the flat", at: 2 });
      // inbound reply with NO planId (the real production shape, pre-routing) → body MUST be masked
      await ctx.db.insert("emailLog", { direction: "in", kind: "reply",
        counterpartyRedacted: "[redacted inbox]", subject: "Re: someones private bill", bodyText: "secret tenant context ₦9,999", at: 1 });
    });
    const rows = await t.query(api.plans.getEmailLedger, { limit: 30 });
    const blob = JSON.stringify(rows);
    expect(blob).toContain("Spotify Family dues");   // showcase outbound shown
    expect(blob).not.toContain("₦8,000");            // private plan-scoped inbound filtered out
    expect(blob).not.toContain("Lagos Flat");
    expect(blob).not.toContain("secret tenant context"); // null-planId inbound body masked
    expect(blob).not.toContain("₦9,999");
    // the masked inbound still signals the rail is bidirectional
    const masked = rows.find((r: any) => r.direction === "in");
    expect(masked?.bodyText).toBe("(reply content is visible to the plan owner)");
  });
});

describe("DH-1 send-budget chokepoint (real enqueueSend early-returns)", () => {
  it("BUDGET_EXHAUSTED at the hard cap — no dues send slips through", async () => {
    const t = convexTest(schema, modules);
    const plan = await seedPlan(t);
    const day = new Date().toISOString().slice(0, 10);
    await t.run(async (ctx: any) => ctx.db.insert("sendBudget", { day, sent: 100, suppressedNonCritical: true }));
    const r = await t.mutation(internal.emailRail.enqueueSend, { kind: "dues", planId: plan, to: "x@example.com", subject: "s", text: "t" });
    expect(r).toEqual({ sent: false, code: "BUDGET_EXHAUSTED" });
  });
  it("suppresses NON-critical at the soft threshold, records a budget_suppressed event", async () => {
    const t = convexTest(schema, modules);
    const plan = await seedPlan(t);
    const day = new Date().toISOString().slice(0, 10);
    await t.run(async (ctx: any) => ctx.db.insert("sendBudget", { day, sent: 80, suppressedNonCritical: false }));
    const r = await t.mutation(internal.emailRail.enqueueSend, { kind: "nag", planId: plan, to: "x@example.com", subject: "s", text: "t" });
    expect(r).toEqual({ sent: false, code: "BUDGET_SUPPRESSED" });
    const events = await t.run(async (ctx: any) => ctx.db.query("events").collect());
    expect(events.some((e: any) => e.type === "budget_suppressed")).toBe(true);
  });
  it("does NOT suppress a CRITICAL kind (ack) at the soft threshold — it proceeds past the guard", async () => {
    const t = convexTest(schema, modules);
    const plan = await seedPlan(t);
    const day = new Date().toISOString().slice(0, 10);
    await t.run(async (ctx: any) => ctx.db.insert("sendBudget", { day, sent: 80, suppressedNonCritical: false }));
    // ack is critical → passes the suppression guard → reaches the agentmail send (unavailable in
    // the test harness → throws). Reaching the throw PROVES it was not suppressed. A returned
    // BUDGET_SUPPRESSED here would be the bug (a joiner's only feedback channel silently dropped).
    let suppressed = false, reachedSend = false;
    try {
      const r: any = await t.mutation(internal.emailRail.enqueueSend, { kind: "ack", planId: plan, to: "x@example.com", subject: "s", text: "t" });
      if (r?.code === "BUDGET_SUPPRESSED") suppressed = true;
    } catch { reachedSend = true; }
    expect(suppressed).toBe(false);
    expect(reachedSend).toBe(true);
  });
});

describe("DH-4 amount-reconciliation containment (recordPayment never auto-confirms a wrong amount)", () => {
  it("downgrades a stray/non-matching amount to `mismatch` on a REAL plan — no false active_paid", async () => {
    const t = convexTest(schema, modules);
    const plan = await seedPlan(t, { isDemo: false, autoConfirm: false, slug: "real-recon" });
    const { seat, cycle } = await t.run(async (ctx: any) => {
      const seat = await ctx.db.insert("seats", { planId: plan, index: 0, state: "active_unpaid", displayLabel: "Seat 1", ownerEnrolled: false, memberEmail: "m@example.com", joinedAt: Date.now() });
      const cycle = await ctx.db.insert("cycles", { planId: plan, openedAt: Date.now(), deadline: Date.now() + 1e6, state: "open", duesKobo: 250000, nagSent: false });
      return { seat, cycle };
    });
    // a paid_claim that carried a STRAY number (e.g. "ref 4021" → 402100 kobo) ≠ dues 250000
    await t.mutation(internal.membership.recordPayment, { planId: plan, seatId: seat, source: "reply", status: "matched", amountKobo: 402100 });
    const [pay, s] = await t.run(async (ctx: any) => [
      (await ctx.db.query("payments").withIndex("by_seat", (q: any) => q.eq("seatId", seat)).order("desc").take(1))[0],
      await ctx.db.get(seat),
    ]);
    expect(pay.status).toBe("mismatch");        // downgraded, owner-flagged
    expect(s.state).not.toBe("active_paid");     // NOT falsely confirmed
    void cycle;
  });
  it("a CORRECT amount matches (containment does not block real payments)", async () => {
    const t = convexTest(schema, modules);
    const plan = await seedPlan(t, { isDemo: false, autoConfirm: false, slug: "real-recon-ok" });
    const seat = await t.run(async (ctx: any) => {
      const seat = await ctx.db.insert("seats", { planId: plan, index: 0, state: "active_unpaid", displayLabel: "Seat 1", ownerEnrolled: false, memberEmail: "m@example.com", joinedAt: Date.now() });
      await ctx.db.insert("cycles", { planId: plan, openedAt: Date.now(), deadline: Date.now() + 1e6, state: "open", duesKobo: 250000, nagSent: false });
      return seat;
    });
    await t.mutation(internal.membership.recordPayment, { planId: plan, seatId: seat, source: "reply", status: "matched", amountKobo: 250000 });
    const pay = await t.run(async (ctx: any) => (await ctx.db.query("payments").withIndex("by_seat", (q: any) => q.eq("seatId", seat)).order("desc").take(1))[0]);
    expect(pay.status).toBe("matched"); // real match survives (owner still confirms — autoConfirm false)
  });
});

describe("DH-1 cycle admission reserve (openCycle never breaches daily headroom)", () => {
  it("refuses to open a cycle whose projected sends would breach the reserve, logs it, no send", async () => {
    const t = convexTest(schema, modules);
    const plan = await seedPlan(t, { isDemo: true, autoConfirm: true, slug: "demo-reserve" });
    const day = new Date().toISOString().slice(0, 10);
    await t.run(async (ctx: any) => {
      await ctx.db.insert("sendBudget", { day, sent: 95, suppressedNonCritical: true }); // only 5 headroom, reserve is 10
      // seat a member so emailable.length > 0 (projected sends would breach 100-10)
      const seat = await ctx.db.insert("seats", { planId: plan, index: 0, state: "active_unpaid", displayLabel: "Seat 1", ownerEnrolled: false, memberEmail: "m@example.com", joinedAt: Date.now() });
      return seat;
    });
    await t.mutation(internal.cycles.openCycle, { planId: plan });
    const openCycles = await t.run(async (ctx: any) =>
      ctx.db.query("cycles").collect().then((cs: any[]) => cs.filter((c) => c.state === "open")));
    expect(openCycles.length).toBe(0); // cycle NOT opened — reserve protected
  });
});
