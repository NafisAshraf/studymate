import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const batchInsert = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    messageId: v.id("messages"),
    steps: v.array(
      v.object({
        stepIndex: v.number(),
        stepName: v.string(),
        durationMs: v.number(),
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
