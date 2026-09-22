import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { CODES, LIMITS, dayKey, normalizeEmail } from "./lib/shared";

// Multi-tenant owner gate (per-plan). Members never hit this path.
async function requirePlanOwner(ctx: any, planId: any) {
  const uid = await getAuthUserId(ctx);
  if (!uid) throw new Error(CODES.OWNER_ONLY);
  const plan = await ctx.db.get(planId);
  if (!plan) throw new Error("plan not found");
  if (plan.ownerUserId !== uid) throw new Error(CODES.OWNER_ONLY);
  return { uid, plan };
}
async function requireSeatOwner(ctx: any, seatId: any) {
  const seat = await ctx.db.get(seatId);
  if (!seat) throw new Error("seat not found");
  await requirePlanOwner(ctx, seat.planId);
  return seat;
}

// Public join — THE ONLY member-creating path for demo plans (NN-1, structural).
export const joinWaitlist = mutation({
  args: { slug: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email) throw new Error("invalid email");
    const plan = await ctx.db.query("plans").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (!plan) throw new Error("plan not found");
    if (plan.anchorReadOnly) throw new Error(CODES.ANCHOR_READ_ONLY);

    // rate limit: 2 joins/address/day (E8/U5)
    const day = dayKey(Date.now());
    const rate = await ctx.db.query("joinRates")
      .withIndex("by_day_email", (q) => q.eq("day", day).eq("email", email)).unique();
    if ((rate?.count ?? 0) >= LIMITS.JOINS_PER_ADDRESS_PER_DAY) throw new Error(CODES.JOIN_RATE_LIMITED);
    if (rate) await ctx.db.patch(rate._id, { count: rate.count + 1 });
    else await ctx.db.insert("joinRates", { day, email, count: 1 });

    // dedupe: already seated or waitlisted on this plan
    const seated = await ctx.db.query("seats")
      .withIndex("by_plan_email", (q) => q.eq("planId", plan._id).eq("memberEmail", email)).unique();
    const listed = await ctx.db.query("waitlist")
      .withIndex("by_plan_email", (q) => q.eq("planId", plan._id).eq("email", email)).unique();
    if (seated || listed) throw new Error(CODES.ALREADY_ON_PLAN);

    const wl = await ctx.db.query("waitlist")
      .withIndex("by_plan_position", (q) => q.eq("planId", plan._id)).collect();
    const position = wl.length === 0 ? 1 : Math.max(...wl.map((w) => w.position)) + 1;
    await ctx.db.insert("waitlist", { planId: plan._id, email, position, joinedAt: Date.now() });
    await ctx.db.insert("events", { planId: plan._id, at: Date.now(), type: "join",
      publicText: `Someone joined the waitlist — position #${position}` });
    await ctx.scheduler.runAfter(0, internal.emailRail.enqueueSend, {
      kind: "ack", planId: plan._id, to: email,
      subject: `You're #${position} in line for ${plan.name}`,
      text: `You joined the waitlist for ${plan.name} (position #${position}).\n` +
        (plan.isDemo ? `This is the labeled demo plan: dues are ₦0 and replying PAID is the payment.\n` : ``) +
        `When a seat opens you'll be promoted automatically and your dues email will arrive here.\n` +
        `Tip: add this address to your contacts so nothing lands in spam.\nWatch live: https://${process.env.SITE_HOST ?? "DEPLOY_AND_RECORD.convex.site"}/#/plan/${plan.slug}`,
    });
    return { position };
  },
});

// Owner-enrollment — legal ONLY on anchorReadOnly plans (NN-1 guard w/ named codes).
export const enrollSeat = mutation({
  args: { planId: v.id("plans"), seatIndex: v.number(), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { plan } = await requirePlanOwner(ctx, args.planId);
    if (plan.isDemo) throw new Error(CODES.DEMO_SEATS_JOIN_ONLY);      // structural NN-1
    if (!plan.anchorReadOnly) throw new Error(CODES.DEMO_SEATS_JOIN_ONLY); // owner-enroll exists ONLY for the anchor surface
    const seat = await ctx.db.query("seats")
      .withIndex("by_plan", (q) => q.eq("planId", args.planId))
      .filter((q) => q.eq(q.field("index"), args.seatIndex)).unique();
    if (!seat) throw new Error("seat not found");
    await ctx.db.patch(seat._id, {
      memberEmail: args.email ? normalizeEmail(args.email) ?? undefined : undefined,
      displayLabel: "owner-enrolled", ownerEnrolled: true, joinedAt: Date.now(), state: "active_unpaid",
    });
    return { ok: true };
  },
});

// Written by ai.parseInbound / emailRail — never by seed (NN-1).
export const recordPayment = internalMutation({
  args: {
    planId: v.id("plans"), seatId: v.id("seats"),
    source: v.union(v.literal("reply"), v.literal("bank_alert"), v.literal("owner")),
    status: v.union(v.literal("matched"), v.literal("mismatch"), v.literal("pending_parse")),
    amountKobo: v.optional(v.number()), messageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    const seat = await ctx.db.get(args.seatId);
    if (!plan || !seat) throw new Error("plan/seat gone");
    const cycle = await ctx.db.query("cycles")
      .withIndex("by_plan_state", (q) => q.eq("planId", args.planId).eq("state", "open")).unique();
    if (!cycle) {
      // late reply after cycle closed (S4 edge): honest late_reported state
      await ctx.db.patch(args.seatId, { state: "late_reported" });
      await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "late_reported",
        publicText: `Late payment reported on ${seat.displayLabel} — owner can reinstate` });
      return { late: true };
    }
    // FINDING-3b: amount reconciliation happens HERE (the one place that knows the dues).
    // An explicit amount that disagrees with the cycle's dues downgrades matched -> mismatch.
    let status = args.status;
    if (status === "matched" && args.amountKobo !== undefined && !plan.isDemo && cycle.duesKobo > 0
        && args.amountKobo !== cycle.duesKobo) {
      status = "mismatch";
    }
    const paymentId = await ctx.db.insert("payments", {
      planId: args.planId, seatId: args.seatId, cycleId: cycle._id,
      source: args.source, status, amountKobo: args.amountKobo, messageId: args.messageId, at: Date.now(),
    });
    if (status === "matched") {
      await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "paid_matched",
        publicText: `${seat.displayLabel}: payment matched — ${plan.autoConfirm ? "auto-confirmed (demo plan)" : "owner confirms"}` });
      if (plan.autoConfirm) {
        await ctx.db.patch(args.seatId, { state: "active_paid", paidAt: Date.now() });
        await ctx.db.patch(paymentId, { status: "confirmed" });
        await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "paid_confirmed",
          publicText: `${seat.displayLabel} is paid up ✓ (auto-confirmed — demo plan)` });
      }
    } else if (status === "mismatch") {
      await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "paid_matched",
        publicText: `${seat.displayLabel}: amount mismatch flagged for owner` });
    }
    return { paymentId };
  },
});

export const confirmPayment = mutation({
  args: { seatId: v.id("seats") },
  handler: async (ctx, args) => {
    const seat = await requireSeatOwner(ctx, args.seatId);
    await ctx.db.patch(args.seatId, { state: "active_paid", paidAt: Date.now() });
    const latest = await ctx.db.query("payments").withIndex("by_seat", (q) => q.eq("seatId", args.seatId)).order("desc").take(1);
    if (latest[0]) await ctx.db.patch(latest[0]._id, { status: "confirmed" });
    await ctx.db.insert("events", { planId: seat.planId, at: Date.now(), type: "paid_confirmed",
      publicText: `${seat.displayLabel} is paid up ✓ (owner confirmed)` });
    return { ok: true };
  },
});

export const reinstate = mutation({
  args: { seatId: v.id("seats") },
  handler: async (ctx, args) => {
    const seat = await requireSeatOwner(ctx, args.seatId);
    await ctx.db.patch(args.seatId, { state: "active_paid", paidAt: Date.now() });
    await ctx.db.insert("events", { planId: seat.planId, at: Date.now(), type: "reinstated",
      publicText: `${seat.displayLabel} reinstated by owner after late payment` });
    return { ok: true };
  },
});
