import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";

// NN-5: one freed seat, two waitlisters → exactly one promotion, FIFO order preserved.
describe("promotion race", () => {
  it("fills one seat with waitlist #1 and leaves #2 first in line", async () => {
    const t = convexTest(schema, import.meta.glob("./../convex/**/*.*s"));
    const ids = await t.run(async (ctx) => {
      const planId = await ctx.db.insert("plans", {
        slug: "t", name: "T", kind: "ownerEntered", priceKobo: 100000, currency: "NGN",
        seatsTotal: 1, cycleMinutes: 3, isDemo: true, autoConfirm: true,
        anchorReadOnly: false, inboxId: "x",
      });
      const seatId = await ctx.db.insert("seats", {
        planId, index: 0, state: "active_unpaid", memberEmail: "old@x.co",
        displayLabel: "Member A", ownerEnrolled: false, joinedAt: 1,
      });
      await ctx.db.insert("waitlist", { planId, email: "first@x.co", position: 1, joinedAt: 2 });
      await ctx.db.insert("waitlist", { planId, email: "second@x.co", position: 2, joinedAt: 3 });
      const cycleId = await ctx.db.insert("cycles", {
        planId, openedAt: 0, deadline: 1, state: "open", duesKobo: 100000, nagSent: true,
      });
      return { planId, seatId, cycleId };
    });

    const { internal } = await import("../convex/_generated/api");
    await t.mutation(internal.cycles.closeCycle, { cycleId: ids.cycleId });

    await t.run(async (ctx) => {
      const seat = await ctx.db.get(ids.seatId);
      expect(seat!.memberEmail).toBe("first@x.co");        // FIFO winner
      expect(seat!.state).toBe("active_unpaid");
      const wl = await ctx.db.query("waitlist").collect();
      expect(wl.length).toBe(1);
      expect(wl[0].email).toBe("second@x.co");             // loser stays first in line
      const events = await ctx.db.query("events").collect();
      expect(events.some((e) => e.type === "evict")).toBe(true);
      expect(events.some((e) => e.type === "promote")).toBe(true);
    });
  });
});
