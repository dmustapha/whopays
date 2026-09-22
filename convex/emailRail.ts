import { internalMutation, internalQuery, internalAction } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { v } from "convex/values";
import { AgentMail } from "@agentmail/convex";
import { CODES, LIMITS, SEND_KINDS, dayKey, redactAddresses, type SendKind } from "./lib/shared";
import { topContent, preClassify, extractAddress } from "./lib/parse";

// DEV-P2-2: explicit `: AgentMail` annotation breaks the implicit-any self-reference cycle
// (agentmail -> internal.emailRail.onInbound -> internal type -> agentmail). Type-only, no behavior change.
export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.emailRail.onInbound,
});

// THE budget chokepoint (NN-7). Every outbound email in the product goes through here.
export const enqueueSend = internalMutation({
  args: { kind: v.string(), planId: v.optional(v.id("plans")), seatId: v.optional(v.id("seats")), to: v.string(), subject: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const kind = args.kind as SendKind;
    const critical = SEND_KINDS[kind]?.critical ?? false;
    const day = dayKey(Date.now());
    const budget = await ctx.db.query("sendBudget").withIndex("by_day", (q) => q.eq("day", day)).unique();
    const sent = budget?.sent ?? 0;

    if (sent >= LIMITS.DAILY_SEND_CAP) {
      await ctx.db.insert("events", { at: Date.now(), type: "budget_suppressed", code: CODES.BUDGET_EXHAUSTED,
        planId: args.planId, publicText: `Daily send cap reached — "${args.kind}" email held until tomorrow` });
      return { sent: false, code: CODES.BUDGET_EXHAUSTED };
    }
    if (!critical && sent >= LIMITS.SOFT_SUPPRESS_AT) {
      if (budget && !budget.suppressedNonCritical) await ctx.db.patch(budget._id, { suppressedNonCritical: true });
      await ctx.db.insert("events", { at: Date.now(), type: "budget_suppressed", code: CODES.BUDGET_SUPPRESSED,
        planId: args.planId, publicText: `Send budget at ${sent}/${LIMITS.DAILY_SEND_CAP} — non-critical "${args.kind}" email suppressed` });
      return { sent: false, code: CODES.BUDGET_SUPPRESSED };
    }

    if (budget) await ctx.db.patch(budget._id, { sent: sent + 1 });
    else await ctx.db.insert("sendBudget", { day, sent: 1, suppressedNonCritical: false });

    // Per-plan inbox when set (schema field honored — FINDING-13), env default otherwise.
    const plan = args.planId ? await ctx.db.get(args.planId) : null;
    const inboxId = (plan?.inboxId && plan.inboxId !== "") ? plan.inboxId : process.env.AGENTMAIL_INBOX_ID!;
    const outboundId = await agentmail.sendMessage(ctx, inboxId, {
      to: args.to, subject: args.subject, text: args.text, labels: ["whopays", args.kind],
    });
    await ctx.db.insert("emailLog", {
      planId: args.planId, direction: "out", kind: args.kind,
      counterpartyRedacted: "[redacted inbox]", subject: args.subject, bodyText: args.text,
      at: Date.now(), status: "enqueued", outboundId: String(outboundId),
    });
    // Thread-first routing (peer-review ADOPT): once the component resolves the send, record
    // threadId -> plan/seat so replies route by thread BEFORE sender matching (alias-proof).
    if (args.planId) {
      await ctx.scheduler.runAfter(90_000, internal.emailRail.recordThread, {
        outboundId: String(outboundId), planId: args.planId, seatId: args.seatId,
      });
    }
    return { sent: true };
  },
});

export const recordThread = internalMutation({
  args: { outboundId: v.string(), planId: v.id("plans"), seatId: v.optional(v.id("seats")) },
  handler: async (ctx, args) => {
    // [UNVERIFIED-until-G2] The component exposes outbound status {status, agentmailMessageId,
    // threadId} as a reactive query (README-cited); the exact function name is confirmed from the
    // installed package at G2 — until then this no-ops and sender matching covers routing.
    let threadId: string | undefined;
    try {
      const status: any = await ctx.runQuery(
        (components.agentmail.lib as any).getOutboundStatus, { outboundId: args.outboundId },
      );
      threadId = status?.threadId ?? undefined;
    } catch {
      return;
    }
    if (!threadId) return;
    const existing = await ctx.db.query("threadMap").withIndex("by_thread", (q) => q.eq("threadId", threadId)).unique();
    if (!existing) await ctx.db.insert("threadMap", { threadId, planId: args.planId, seatId: args.seatId });
  },
});

// Inbound: the component calls this internalMutation after Svix signature-check + event_id dedupe.
export const onInbound = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, args) => {
    const m = args.message; // snake_case per component README
    const text: string = m.text ?? "";
    await ctx.db.insert("emailLog", {
      direction: "in", kind: "reply", counterpartyRedacted: "[redacted inbox]",
      subject: redactAddresses(m.subject ?? "(no subject)"), bodyText: redactAddresses(topContent(text).slice(0, 2000)) || "(empty — may exceed 1MB, re-fetching)",
      at: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.emailRail.routeInbound, {
      inboxId: m.inbox_id, messageId: m.message_id, threadId: m.thread_id ?? "",
      inReplyTo: m.in_reply_to ?? "", from: m.from_ ?? "", subject: m.subject ?? "", text,
    });
  },
});

// Routing: thread/sender → seat; classify; record. Runs as internalAction (may re-fetch >1MB bodies + call OpenAI).
export const routeInbound = internalAction({
  args: {
    inboxId: v.string(), messageId: v.string(), threadId: v.string(),
    inReplyTo: v.string(), from: v.string(), subject: v.string(), text: v.string(),
  },
  handler: async (ctx, args) => {
    let body = args.text;
    if (!body) {
      // >1MB payload: text omitted — re-fetch via component (E7)
      try {
        const full: any = await agentmail.getMessage(ctx, args.inboxId, args.messageId);
        body = full?.text ?? "";
      } catch { body = ""; }
    }
    const top = topContent(body);
    const pre = preClassify(args.subject, top, {});
    await ctx.runMutation(internal.emailRail.markProcessed, { messageId: args.messageId });
    if (pre === "auto_reply") return; // E4: never respond to auto-responders

    // Route by THREAD first (alias-proof), sender second (E3 order restored per peer review).
    let seat = args.threadId
      ? await ctx.runQuery(internal.emailRail.findSeatByThread, { threadId: args.threadId })
      : null;
    if (!seat) seat = await ctx.runQuery(internal.emailRail.findSeatByEmail, { email: extractAddress(args.from), inboxId: args.inboxId });
    if (!seat) {
      await ctx.runMutation(internal.emailRail.stashUnrecognized, {
        messageId: args.messageId, inboxId: args.inboxId, topText: top.slice(0, 500),
      });
      return; // E3: surfaced to owner, never dropped
    }
    if (pre === "paid_claim") {
      // Deterministic hero path — no LLM latency in the kill-shot loop.
      await ctx.runMutation(internal.membership.recordPayment, {
        planId: seat.planId, seatId: seat.seatId, source: "reply", status: "matched", messageId: args.messageId,
      });
      return;
    }
    // Everything else: OpenAI reads it (bank alerts, phrasings, amounts).
    await ctx.runAction(internal.ai.parseInbound, {
      planId: seat.planId, seatId: seat.seatId, messageId: args.messageId, top, subject: args.subject,
    });
  },
});

export const findSeatByEmail = internalQuery({
  args: { email: v.string(), inboxId: v.string() },
  handler: async (ctx, args) => {
    // Multi-tenant: a reply must credit a seat on the plan that OWNS the inbox it arrived at —
    // never the first global match for that address (which could be another tenant's seat).
    // Normalize "" → env default exactly as the send rail resolves inboxes (enqueueSend).
    const defaultInbox = process.env.AGENTMAIL_INBOX_ID ?? "";
    const inboxPlanIds = new Set(
      (await ctx.db.query("plans").collect())
        .filter((p) => (p.inboxId && p.inboxId !== "" ? p.inboxId : defaultInbox) === args.inboxId)
        .map((p) => p._id),
    );
    if (inboxPlanIds.size === 0) return null;
    // Match the address only within this inbox's plans (composite index, tenant-scoped).
    const seats = await ctx.db.query("seats")
      .withIndex("by_email", (q) => q.eq("memberEmail", args.email)).collect();
    const seat = seats.find((s) => inboxPlanIds.has(s.planId));
    return seat ? { planId: seat.planId, seatId: seat._id } : null;
  },
});

export const findSeatByThread = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("threadMap").withIndex("by_thread", (q) => q.eq("threadId", args.threadId)).unique();
    return row?.seatId ? { planId: row.planId, seatId: row.seatId } : null;
  },
});

export const stashUnrecognized = internalMutation({
  args: { messageId: v.string(), inboxId: v.string(), topText: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("unrecognized", {
      fromRedacted: "[redacted inbox]", receivedAt: Date.now(),
      topText: redactAddresses(args.topText), messageId: args.messageId, inboxId: args.inboxId, resolved: false,
    });
    await ctx.db.insert("events", { at: Date.now(), type: "unrecognized_reply",
      publicText: "A reply arrived from an address not on any plan — queued for the owner" });
  },
});

// E6 belt+braces: 60s polling fallback via the component's reactive inbound cache.
export const pollInbound = internalAction({
  args: {},
  handler: async (ctx) => {
    const inboxId = process.env.AGENTMAIL_INBOX_ID;
    if (!inboxId) return;
    const msgs: any = await ctx.runQuery(components.agentmail.lib.listInboundMessages, { inboxId });
    const list: any[] = Array.isArray(msgs) ? msgs : msgs?.messages ?? [];
    for (const m of list.slice(0, 20)) {
      const seen = await ctx.runQuery(internal.emailRail.alreadyProcessed, { messageId: m.message_id ?? m.messageId ?? "" });
      if (!seen) {
        await ctx.runAction(internal.emailRail.routeInbound, {
          inboxId, messageId: m.message_id ?? m.messageId ?? "", threadId: m.thread_id ?? "",
          inReplyTo: m.in_reply_to ?? "", from: (m.from_ ?? m.from ?? "").toLowerCase(),
          subject: m.subject ?? "", text: m.text ?? "",
        });
      }
    }
  },
});

export const alreadyProcessed = internalQuery({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    if (!args.messageId) return true;
    const row = await ctx.db.query("processedMessages")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId)).unique();
    return row !== null;
  },
});

// FINDING-11 fix: every routed message is recorded once — auto-replies and empties included —
// so the 60s poll never re-processes and never table-scans.
export const markProcessed = internalMutation({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    if (!args.messageId) return;
    const row = await ctx.db.query("processedMessages")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId)).unique();
    if (!row) await ctx.db.insert("processedMessages", { messageId: args.messageId, at: Date.now() });
  },
});
