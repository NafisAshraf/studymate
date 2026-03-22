import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const bySession = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_sessionId_and_createdAt", (q) =>
        q.eq("sessionId", args.sessionId)
      )
      .take(200);
  },
});

export const send = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    citationChunkIds: v.optional(v.array(v.id("chunks"))),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      createdAt: Date.now(),
      citationChunkIds: args.citationChunkIds,
    });
    await ctx.db.patch(args.sessionId, { updatedAt: Date.now() });
    return id;
  },
});
