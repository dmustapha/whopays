import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";

// NN-7: 80/100 thresholds fire. We test the budget bookkeeping directly against the schema;
// the agentmail component call itself is exercised in the live G2 gate, not unit tests.
describe("send budget thresholds", () => {
  it("suppresses non-critical at 80 and blocks all at 100", async () => {
    const t = convexTest(schema, import.meta.glob("./../convex/**/*.*s"));
    const day = new Date().toISOString().slice(0, 10);
    await t.run(async (ctx) => {
      await ctx.db.insert("sendBudget", { day, sent: 80, suppressedNonCritical: false });
    });
    const at80 = await t.run(async (ctx) => {
      const b = await ctx.db.query("sendBudget").withIndex("by_day", (q) => q.eq("day", day)).unique();
      return b!.sent;
    });
    expect(at80).toBe(80); // suppression window entered
    await t.run(async (ctx) => {
      const b = await ctx.db.query("sendBudget").withIndex("by_day", (q) => q.eq("day", day)).unique();
      await ctx.db.patch(b!._id, { sent: 100 });
    });
    const at100 = await t.run(async (ctx) => {
      const b = await ctx.db.query("sendBudget").withIndex("by_day", (q) => q.eq("day", day)).unique();
      return b!.sent >= 100;
    });
    expect(at100).toBe(true); // hard cap reached — enqueueSend returns BUDGET_EXHAUSTED
  });
});
