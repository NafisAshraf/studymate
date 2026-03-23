import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    bookId: v.id("books"),
    filename: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("bookImages", args);
  },
});

export const byBook = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("bookImages")
      .withIndex("by_bookId", (q) => q.eq("bookId", args.bookId))
      .collect();

    const results: { filename: string; url: string }[] = [];
    for (const img of images) {
      const url = await ctx.storage.getUrl(img.storageId);
      if (url) {
        results.push({ filename: img.filename, url });
      }
    }
    return results;
  },
});

export const byBooks = query({
  args: { bookIds: v.array(v.id("books")) },
  handler: async (ctx, args) => {
    const results: { filename: string; url: string }[] = [];
    for (const bookId of args.bookIds) {
      const images = await ctx.db
        .query("bookImages")
        .withIndex("by_bookId", (q) => q.eq("bookId", bookId))
        .collect();
      for (const img of images) {
        const url = await ctx.storage.getUrl(img.storageId);
        if (url) results.push({ filename: img.filename, url });
      }
    }
    return results;
  },
});

export const deleteByBook = internalMutation({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 100;
    const images = await ctx.db
      .query("bookImages")
      .withIndex("by_bookId", (q) => q.eq("bookId", args.bookId))
      .take(BATCH_SIZE);

    for (const img of images) {
      await ctx.storage.delete(img.storageId);
      await ctx.db.delete(img._id);
    }

    // If we hit the batch limit, schedule another run for remaining items
    if (images.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.bookImages.deleteByBook,
        { bookId: args.bookId }
      );
    }
  },
});
