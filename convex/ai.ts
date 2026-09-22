import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { looksLikeBankAlert } from "./lib/parse";
import { parseNairaToKobo } from "./lib/shared";

async function openaiJson(system: string, user: string, schemaName: string, schema: object): Promise<any | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
      max_tokens: 500,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  try { return JSON.parse(data.choices[0].message.content); } catch { return null; }
}

// Classify an inbound email that the deterministic pre-classifier couldn't resolve.
export const parseInbound = internalAction({
  args: { planId: v.id("plans"), seatId: v.id("seats"), messageId: v.string(), top: v.string(), subject: v.string() },
  handler: async (ctx, args) => {
    const out = await openaiJson(
      "You read emails sent to a shared-bill ledger. Classify the message and extract any payment amount in Nigerian naira. " +
      "kinds: paid_claim (sender says they paid), bank_alert (forwarded bank credit/transaction alert), other. " +
      "NEVER invent an amount; amount_naira is null unless a number is explicitly present.",
      `Subject: ${args.subject}\n\nBody (top content only):\n${args.top.slice(0, 3000)}`,
      "inbound_classification",
      { type: "object", additionalProperties: false, required: ["kind", "amount_naira"],
        properties: { kind: { type: "string", enum: ["paid_claim", "bank_alert", "other"] },
                      amount_naira: { type: ["number", "null"] } } },
    );
    if (!out) {
      // R5: OpenAI down → honest pending state, owner can match manually. Never fabricate.
      await ctx.runMutation(internal.membership.recordPayment, {
        planId: args.planId, seatId: args.seatId, source: "reply", status: "pending_parse", messageId: args.messageId,
      });
      return;
    }
    if (out.kind === "paid_claim" || (out.kind === "bank_alert" && looksLikeBankAlert(args.top))) {
      const amountKobo = out.amount_naira ? Math.round(out.amount_naira * 100) : parseNairaToKobo(args.top) ?? undefined;
      await ctx.runMutation(internal.membership.recordPayment, {
        planId: args.planId, seatId: args.seatId,
        source: out.kind === "bank_alert" ? "bank_alert" : "reply",
        status: "matched", amountKobo, messageId: args.messageId,
      });
    } else {
      await ctx.runMutation(internal.emailRail.stashUnrecognized, {
        messageId: args.messageId, inboxId: "", topText: args.top.slice(0, 500),
      });
    }
  },
});

// Extract plan offerings from a crawled page's markdown (add-plan-by-URL + price watch).
export const extractPlans = internalAction({
  args: { markdown: v.string() },
  handler: async (_ctx, args): Promise<Array<{ plan_name: string; priceKobo: number }>> => {
    const out = await openaiJson(
      "Extract subscription/service plan offerings and their MONTHLY prices in Nigerian naira from this page. " +
      "Only include plans with an explicit numeric price on the page. Never guess.",
      args.markdown,
      "plan_extraction",
      { type: "object", additionalProperties: false, required: ["plans"],
        properties: { plans: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["plan_name", "price_naira"],
          properties: { plan_name: { type: "string" }, price_naira: { type: "number" } } } } } },
    );
    if (!out?.plans) return [];
    return out.plans
      .filter((p: any) => typeof p.price_naira === "number" && p.price_naira > 0)
      .map((p: any) => ({ plan_name: String(p.plan_name), priceKobo: Math.round(p.price_naira * 100) }));
  },
});
