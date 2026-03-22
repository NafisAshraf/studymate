import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const rootSections = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    const allSections = await ctx.db
      .query("sections")
      .withIndex("by_bookId_and_order", (q) => q.eq("bookId", args.bookId))
      .take(500);
    return allSections.filter((s) => s.parentSectionId === undefined);
  },
});

export const children = query({
  args: { parentSectionId: v.id("sections") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sections")
      .withIndex("by_parentSectionId", (q) =>
        q.eq("parentSectionId", args.parentSectionId)
      )
      .take(200);
  },
});

export const get = query({
  args: { id: v.id("sections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const byBook = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sections")
      .withIndex("by_bookId_and_order", (q) => q.eq("bookId", args.bookId))
      .take(500);
  },
});

export const batchInsert = mutation({
  args: {
    sections: v.array(
      v.object({
        bookId: v.id("books"),
        datalabId: v.string(),
        title: v.string(),
        htmlTag: v.string(),
        level: v.number(),
        parentSectionId: v.optional(v.id("sections")),
        order: v.number(),
        page: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const section of args.sections) {
      const id = await ctx.db.insert("sections", section);
      ids.push(id);
    }
    return ids;
  },
});
