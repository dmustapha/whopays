import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { duesPerSeat, formatNaira, memberLabel } from "./lib/shared";

// Tick — runs every minute from crons.ts. RECOVERY ONLY for closes (openCycle schedules the
// precise close via ctx.scheduler.runAt — peer-review ADOPT); tick re-opens plans, fires nags,
// and sweeps any close the scheduler missed. Idempotent: each branch re-checks state.
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const plans = await ctx.db.query("plans").collect();
    for (const plan of plans) {
      const open = await ctx.db.query("cycles")
        .withIndex("by_plan_state", (q) => q.eq("planId", plan._id).eq("state", "open")).unique();
      if (!open) {
        // ACTIVITY GATE (demo plans only): an idle demo board pauses between cycles.
        if (plan.isDemo) {
          const recent = await ctx.db.query("events")
            .withIndex("by_plan_time", (q) => q.eq("planId", plan._id)).order("desc").take(1);
          const lastActivity = recent[0]?.at ?? 0;
          if (now - lastActivity > 30 * 60_000) continue; // board idle — a join wakes it (Board shows the idle state)
        }
        await ctx.scheduler.runAfter(0, internal.cycles.openCycle, { planId: plan._id });
        continue;
      }
      const half = open.openedAt + (open.deadline - open.openedAt) / 2;
      if (!open.nagSent && now >= half && now < open.deadline) {
        await ctx.db.patch(open._id, { nagSent: true });
        await ctx.scheduler.runAfter(0, internal.cycles.sendNags, { cycleId: open._id });
      }
      if (now >= open.deadline) {
        await ctx.scheduler.runAfter(0, internal.cycles.closeCycle, { cycleId: open._id });
      }
    }
  },
});

export const openCycle = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) return;
    const existing = await ctx.db.query("cycles")
      .withIndex("by_plan_state", (q) => q.eq("planId", args.planId).eq("state", "open")).unique();
    if (existing) return; // idempotent
    const now = Date.now();
    const dues = duesPerSeat(plan.priceKobo, plan.seatsTotal);

    // SEND-ADMISSION GUARD (peer-review ADOPT): project this cycle's sends and refuse to open
    // if it would eat into the reserved daily headroom. Bounded cycles > dead rail.
    const seatsAll = await ctx.db.query("seats").withIndex("by_plan", (q) => q.eq("planId", args.planId)).collect();
    const freshCutoff = now - 60 * 60_000;
    const emailable = seatsAll.filter((s) => s.memberEmail &&
      (!plan.isDemo || (s.joinedAt ?? 0) >= freshCutoff));
    const day = new Date(now).toISOString().slice(0, 10);
    const budget = await ctx.db.query("sendBudget").withIndex("by_day", (q) => q.eq("day", day)).unique();
    const projected = emailable.length * 2; // dues now + evict/promote at close (upper bound)
    if ((budget?.sent ?? 0) + projected > 100 - 10) {
      await ctx.db.insert("events", { planId: args.planId, at: now, type: "budget_suppressed",
        code: "BUDGET_SUPPRESSED",
        publicText: `Cycle not opened: projected ${projected} sends would breach the reserved daily allowance — board resumes after the UTC reset` });
      return;
    }

    const deadline = now + plan.cycleMinutes * 60_000;
    const cycleId = await ctx.db.insert("cycles", {
      planId: args.planId, openedAt: now, deadline,
      state: "open", duesKobo: plan.isDemo ? 0 : dues, nagSent: false,
    });
    // Precise close at the deadline (tick remains the idempotent recovery sweep).
    await ctx.scheduler.runAt(deadline, internal.cycles.closeCycle, { cycleId });
    await ctx.db.insert("events", { planId: args.planId, at: now, type: "cycle_opened",
      publicText: `New cycle opened — dues ${plan.isDemo ? "₦0 (demo plan — replying PAID is the payment)" : formatNaira(dues)}, deadline in ${plan.cycleMinutes >= 1440 ? Math.round(plan.cycleMinutes / 1440) + "d" : plan.cycleMinutes + "min"}` });
    // Dues emails: every occupied active seat — on demo plans, only FRESH seats get email
    // (stale probe addresses transition state without burning sends; the board shows it either way).
    for (const seat of seatsAll) {
      if (seat.memberEmail && (seat.state === "active_unpaid" || seat.state === "active_paid")) {
        if (seat.state === "active_paid") await ctx.db.patch(seat._id, { state: "active_unpaid", paidAt: undefined });
        const fresh = !plan.isDemo || (seat.joinedAt ?? 0) >= freshCutoff;
        if (fresh) {
          await ctx.scheduler.runAfter(0, internal.emailRail.enqueueSend, {
            kind: "dues", planId: args.planId, seatId: seat._id, to: seat.memberEmail,
            subject: `${plan.name}: dues for this cycle — ${plan.isDemo ? "₦0 (demo)" : formatNaira(dues)}`,
            text: duesBody(plan, dues, seat.displayLabel),
          });
          await ctx.db.insert("events", { planId: args.planId, at: Date.now(), type: "dues_sent",
            publicText: `Dues email sent to ${seat.displayLabel}` });
        }
      }
    }
  },
});

export const sendNags = internalMutation({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle || cycle.state !== "open") return;
    const plan = await ctx.db.get(cycle.planId);
    if (!plan) return;
    const seats = await ctx.db.query("seats").withIndex("by_plan", (q) => q.eq("planId", cycle.planId)).collect();
    for (const seat of seats) {
      if (seat.memberEmail && seat.state === "active_unpaid") {
        await ctx.scheduler.runAfter(0, internal.emailRail.enqueueSend, {
          kind: "nag", planId: cycle.planId, to: seat.memberEmail,
          subject: `${plan.name}: reminder — dues deadline approaching`,
          text: `Half the cycle is gone and your seat (${seat.displayLabel}) is still unpaid.\nReply PAID once you've settled, or your seat is released to the waitlist at the deadline.`,
        });
      }
    }
  },
});

// THE kill-shot mutation. ONE transaction: evict → promote → close → reopen (NN-5).
export const closeCycle = internalMutation({
  args: { cycleId: v.id("cycles") },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle || cycle.state !== "open") return; // idempotent — a concurrent close already won
    const plan = await ctx.db.get(cycle.planId);
    if (!plan) return;
    const now = Date.now();

    // 1. Evict unpaid occupied seats
    const seats = await ctx.db.query("seats").withIndex("by_plan", (q) => q.eq("planId", cycle.planId)).collect();
    const freed: typeof seats = [];
    for (const seat of seats) {
      if (seat.state === "active_unpaid" && seat.memberEmail && !seat.ownerEnrolled) {
        await ctx.db.patch(seat._id, { state: "evicted" });
        await ctx.db.insert("events", { planId: cycle.planId, at: now, type: "evict",
          publicText: `${seat.displayLabel} evicted — dues unpaid at deadline` });
        const fresh = !plan.isDemo || (seat.joinedAt ?? 0) >= now - 60 * 60_000;
        if (fresh) {
          await ctx.scheduler.runAfter(0, internal.emailRail.enqueueSend, {
            kind: "eviction", planId: cycle.planId, seatId: seat._id, to: seat.memberEmail,
            subject: `${plan.name}: your seat was released`,
            text: `The cycle closed with your dues unpaid, so your seat was released to the waitlist.\nReply PAID if you actually paid — the owner can reinstate you.`,
          });
        }
        freed.push(seat);
      }
    }
    // Fillable = just-freed seats + prior-cycle evicted seats + never-occupied seats.
    // NOTE: `seats` was read before the patches above — just-freed seats still read their OLD
    // state in memory, so membership in `freed` is checked by identity, not by state.
    const freedIds = new Set(freed.map((f) => f._id));
    const fillable = seats.filter(
      (s) => !s.ownerEnrolled && (freedIds.has(s._id) || s.state === "evicted" || !s.memberEmail),
    );

    // 2. Promote waitlist FIFO into freed seats (same transaction — no race window, NN-5)
    const wl = await ctx.db.query("waitlist")
      .withIndex("by_plan_position", (q) => q.eq("planId", cycle.planId)).collect();
    const queue = wl.sort((a, b) => a.position - b.position);
    let promoted = 0;
    for (const target of fillable) {
      const next = queue[promoted];
      if (!next) break;
      await ctx.db.patch(target._id, {
        state: "active_unpaid", memberEmail: next.email,
        displayLabel: memberLabel(target.index), ownerEnrolled: false, joinedAt: now, paidAt: undefined,
      });
      await ctx.db.delete(next._id);
      await ctx.db.insert("events", { planId: cycle.planId, at: now, type: "promote",
        publicText: `Waitlist #${next.position} promoted into ${target.displayLabel ?? "a seat"} → now ${memberLabel(target.index)}` });
      await ctx.scheduler.runAfter(0, internal.emailRail.enqueueSend, {
        kind: "promotion", planId: cycle.planId, seatId: target._id, to: next.email,
        subject: `${plan.name}: you're in — a seat opened for you`,
        text: `You were first in line and an unpaid seat was released, so you now hold ${memberLabel(target.index)}.\nYour dues email for the new cycle arrives separately. Reply PAID to it once settled.`,
      });
      promoted++;
    }
    if (queue.length > promoted && promoted === 0 && fillable.length === 0) {
      await ctx.db.insert("events", { planId: cycle.planId, at: now, type: "race_refused", code: "RACE_REFUSED",
        publicText: `Cycle closed with a full board — waitlist #${queue[promoted]?.position ?? 1} stays first in line (no double-fill)` });
    }

    // 3. Close and reopen
    await ctx.db.patch(cycle._id, { state: "closed" });
    await ctx.scheduler.runAfter(0, internal.cycles.openCycle, { planId: cycle.planId });
  },
});

function duesBody(plan: { name: string; isDemo: boolean; sourceUrl?: string; lastCrawlAt?: number }, duesKobo: number, label: string): string {
  const priceLine = plan.isDemo
    ? `Dues this cycle: ₦0 — this is the labeled demo plan; replying PAID is the payment.`
    : `Your share this cycle: ${formatNaira(duesKobo)}.`;
  const provenance = plan.sourceUrl
    ? `Price source: ${plan.sourceUrl}${plan.lastCrawlAt ? ` (checked ${new Date(plan.lastCrawlAt).toISOString()})` : ""}`
    : `Price: owner-entered.`;
  return `You hold ${label} on ${plan.name}.\n${priceLine}\n${provenance}\nReply PAID when you've settled. Forwarded bank alerts are read too ("matched" — the owner confirms).`;
}
