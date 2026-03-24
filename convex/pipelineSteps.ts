import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const batchInsert = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    messageId: v.id("messages"),
    steps: v.array(
      v.object({
        stepIndex: v.number(),
        stepName: v.union(
          v.literal("query_rewrite"),
          v.literal("search"),
          v.literal("rerank"),
          v.literal("generate")
        ),
        durationMs: v.number(),
        provider: v.optional(
          v.union(v.literal("openrouter"), v.literal("fireworks"))
        ),
        model: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
        cost: v.optional(v.number()),
        costUnit: v.optional(
          v.union(v.literal("credits"), v.literal("usd"), v.literal("unknown"))
        ),
        providerRequestId: v.optional(v.string()),
        usageRaw: v.optional(v.string()),
        data: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const step of args.steps) {
      await ctx.db.insert("pipelineSteps", {
        messageId: args.messageId,
        sessionId: args.sessionId,
        stepIndex: step.stepIndex,
        stepName: step.stepName,
        durationMs: step.durationMs,
        provider: step.provider,
        model: step.model,
        inputTokens: step.inputTokens,
        outputTokens: step.outputTokens,
        totalTokens: step.totalTokens,
        cost: step.cost,
        costUnit: step.costUnit,
        providerRequestId: step.providerRequestId,
        usageRaw: step.usageRaw,
        data: step.data,
      });
    }
  },
});

export const byMessage = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("pipelineSteps")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .take(10);
    return steps.sort((a, b) => a.stepIndex - b.stepIndex);
  },
});
