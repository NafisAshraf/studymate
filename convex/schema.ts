import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  books: defineTable({
    title: v.string(),
    language: v.optional(v.string()),
    pageCount: v.number(),
    blockCount: v.number(),
    chunkCount: v.number(),
    status: v.union(
      v.literal("parsing"),
      v.literal("embedding"),
      v.literal("ready"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
    uploadedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_uploadedAt", ["uploadedAt"]),

  sections: defineTable({
    bookId: v.id("books"),
    datalabId: v.string(),
    title: v.string(),
    htmlTag: v.string(),
    level: v.number(),
    parentSectionId: v.optional(v.id("sections")),
    order: v.number(),
    page: v.number(),
  })
    .index("by_bookId", ["bookId"])
    .index("by_bookId_and_order", ["bookId", "order"])
    .index("by_bookId_and_datalabId", ["bookId", "datalabId"])
    .index("by_parentSectionId", ["parentSectionId"]),

  chunks: defineTable({
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
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_bookId", ["bookId"])
    .index("by_sectionId", ["sectionId"])
    .index("by_sectionId_and_order", ["sectionId", "order"])
    .index("by_bookId_and_order", ["bookId", "order"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 4096,
      filterFields: ["bookId"],
    })
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["bookId"],
    }),

  bookImages: defineTable({
    bookId: v.id("books"),
    filename: v.string(),
    storageId: v.id("_storage"),
  })
    .index("by_bookId", ["bookId"])
    .index("by_bookId_and_filename", ["bookId", "filename"]),

  chatSessions: defineTable({
    title: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_updatedAt", ["updatedAt"]),

  messages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    citationChunkIds: v.optional(v.array(v.id("chunks"))),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_sessionId_and_createdAt", ["sessionId", "createdAt"]),

  pipelineSteps: defineTable({
    messageId: v.id("messages"),
    sessionId: v.id("chatSessions"),
    stepIndex: v.number(),
    stepName: v.string(),
    durationMs: v.number(),
    data: v.string(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_sessionId", ["sessionId"]),
});
