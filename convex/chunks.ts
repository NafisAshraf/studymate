import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

export const bySectionOrdered = query({
  args: { sectionId: v.id("sections") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chunks")
      .withIndex("by_sectionId_and_order", (q) =>
        q.eq("sectionId", args.sectionId)
      )
      .take(200);
  },
});

export const get = query({
  args: { id: v.id("chunks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getMany = query({
  args: { ids: v.array(v.id("chunks")) },
  handler: async (ctx, args) => {
    const chunks = [];
    for (const id of args.ids) {
      const chunk = await ctx.db.get(id);
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  },
});

export const batchInsert = mutation({
  args: {
    chunks: v.array(
      v.object({
        bookId: v.id("books"),
        sectionId: v.id("sections"),
        datalabId: v.string(),
        blockType: v.string(),
        content: v.string(),
        html: v.string(),
        page: v.number(),
        order: v.number(),
        sectionPath: v.string(),
        embeddingText: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const chunk of args.chunks) {
      const id = await ctx.db.insert("chunks", chunk);
      ids.push(id);
    }
    return ids;
  },
});

export const setEmbedding = mutation({
  args: {
    id: v.id("chunks"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { embedding: args.embedding });
  },
});

export const vectorSearch = action({
  args: {
    embedding: v.array(v.float64()),
    bookId: v.optional(v.id("books")),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const results = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: args.embedding,
      limit: args.limit,
      filter: args.bookId
        ? (q) => q.eq("bookId", args.bookId as Id<"books">)
        : undefined,
    });
    const chunks: (Doc<"chunks"> & { score: number })[] = [];
    for (const result of results) {
      const chunk: Doc<"chunks"> | null = await ctx.runQuery(api.chunks.get, { id: result._id });
      if (chunk) {
        chunks.push({ ...chunk, score: result._score });
      }
    }
    return chunks;
  },
});
