import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("books")
      .withIndex("by_uploadedAt")
      .order("desc")
      .take(50);
  },
});

export const get = query({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    language: v.optional(v.string()),
    pageCount: v.number(),
    blockCount: v.number(),
    chunkCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("books", {
      ...args,
      status: "parsing",
      uploadedAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("books"),
    status: v.union(
      v.literal("parsing"),
      v.literal("embedding"),
      v.literal("ready"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      errorMessage: args.errorMessage,
    });
  },
});

export const rename = mutation({
  args: {
    id: v.id("books"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const remove = mutation({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    // Schedule image cleanup (paginated internal mutation)
    await ctx.scheduler.runAfter(0, internal.bookImages.deleteByBook, {
      bookId: args.id,
    });

    // Delete all chunks for this book (paginated to handle large books)
    let hasMore = true;
    while (hasMore) {
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_bookId", (q) => q.eq("bookId", args.id))
        .take(500);
      for (const chunk of chunks) {
        await ctx.db.delete(chunk._id);
      }
      hasMore = chunks.length === 500;
    }

    // Delete all sections for this book
    hasMore = true;
    while (hasMore) {
      const sections = await ctx.db
        .query("sections")
        .withIndex("by_bookId", (q) => q.eq("bookId", args.id))
        .take(500);
      for (const section of sections) {
        await ctx.db.delete(section._id);
      }
      hasMore = sections.length === 500;
    }

    // Delete the book itself
    await ctx.db.delete(args.id);
  },
});
