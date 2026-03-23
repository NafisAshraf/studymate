import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { generateHyDE } from "@/lib/rag/hyde";
import { embedText } from "@/lib/rag/embeddings";
import { rerankChunks } from "@/lib/rag/reranker";
import { streamAnswer } from "@/lib/rag/generator";
import { retryWithBackoff } from "@/lib/rag/retry";
import type {
  RetrievedChunk,
  AssembledSection,
  PipelineCitation,
} from "@/lib/rag/types";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function extractImageFilenames(html: string): string[] {
  const filenames: string[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    filenames.push(match[1]);
  }
  return filenames;
}

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const { sessionId, query } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1. Save user message
        await convex.mutation(api.messages.send, {
          sessionId: sessionId as Id<"chatSessions">,
          role: "user",
          content: query,
        });

        // 2. Fetch conversation history
        const messages = await convex.query(api.messages.bySession, {
          sessionId: sessionId as Id<"chatSessions">,
        });
        const history = messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        }));

        // 3. HyDE query rewriting
        controller.enqueue(
          encoder.encode(
            sseEvent("status", { step: "hyde", message: "Rewriting query..." })
          )
        );
        const hydeText = await generateHyDE(query, history);

        // 4. Embed the HyDE text
        controller.enqueue(
          encoder.encode(
            sseEvent("status", {
              step: "embedding",
              message: "Embedding query...",
            })
          )
        );
        const queryEmbedding = await embedText(hydeText);

        // 5. Vector search
        controller.enqueue(
          encoder.encode(
            sseEvent("status", {
              step: "searching",
              message: "Searching books...",
            })
          )
        );
        const searchResults = (await convex.action(api.chunks.vectorSearch, {
          embedding: queryEmbedding,
          limit: 20,
        })) as RetrievedChunk[];

        if (searchResults.length === 0) {
          controller.enqueue(
            encoder.encode(
              sseEvent("chunk", {
                text: "I couldn't find any relevant information in your books to answer this question. Please make sure you've uploaded books that cover this topic.",
              })
            )
          );
          controller.enqueue(
            encoder.encode(sseEvent("done", { messageId: null }))
          );
          controller.close();
          return;
        }

        // 6. Rerank
        controller.enqueue(
          encoder.encode(
            sseEvent("status", {
              step: "reranking",
              message: "Ranking results...",
            })
          )
        );
        const rerankedChunks = await rerankChunks(query, searchResults);

        // 7. Parent-section assembly
        controller.enqueue(
          encoder.encode(
            sseEvent("status", {
              step: "assembling",
              message: "Assembling context...",
            })
          )
        );

        const seenSectionIds = new Set<string>();
        const assembledSections: AssembledSection[] = [];
        const imageFilenames = new Set<string>();
        const bookIdsForImages = new Set<string>();

        for (const chunk of rerankedChunks) {
          if (seenSectionIds.has(chunk.sectionId)) continue;
          seenSectionIds.add(chunk.sectionId);

          if (assembledSections.length >= 5) break;

          const sectionChunks = await convex.query(
            api.chunks.bySectionOrdered,
            {
              sectionId: chunk.sectionId as Id<"sections">,
            }
          );

          const contentParts: string[] = [];
          for (const c of sectionChunks as Array<{ content: string; html: string; blockType: string; bookId: string }>) {
            const filenames = extractImageFilenames(c.html);
            if (filenames.length > 0) {
              for (const filename of filenames) {
                imageFilenames.add(filename);
                bookIdsForImages.add(c.bookId);
              }
              // For image-only blocks, use the full content as description
              if (c.blockType === "Figure" || c.blockType === "Picture") {
                contentParts.push(
                  filenames.map(f => `[IMAGE: "${c.content}" | file: ${f}]`).join("\n\n")
                );
              } else {
                // Text block with embedded images — include content + image refs
                contentParts.push(c.content);
                for (const f of filenames) {
                  contentParts.push(`[IMAGE: file: ${f}]`);
                }
              }
            } else {
              contentParts.push(c.content);
            }
          }

          const sectionContent = contentParts.join("\n\n");

          assembledSections.push({
            sectionId: chunk.sectionId,
            sectionPath: chunk.sectionPath,
            content: sectionContent,
            anchorChunkId: chunk._id,
            page: chunk.page,
          });
        }

        // 7b. Resolve image URLs
        const imageMap: Record<string, string> = {};
        for (const bookId of bookIdsForImages) {
          const images = await convex.query(api.bookImages.byBook, {
            bookId: bookId as Id<"books">,
          });
          for (const img of images) {
            if (imageFilenames.has(img.filename)) {
              imageMap[img.filename] = img.url;
            }
          }
        }

        if (Object.keys(imageMap).length > 0) {
          controller.enqueue(
            encoder.encode(sseEvent("images", { imageMap }))
          );
        }

        // 8. Stream answer generation
        controller.enqueue(
          encoder.encode(
            sseEvent("status", {
              step: "generating",
              message: "Generating answer...",
            })
          )
        );

        let fullAnswer = "";
        for await (const token of streamAnswer(
          query,
          assembledSections,
          history,
          Object.keys(imageMap)
        )) {
          fullAnswer += token;
          controller.enqueue(
            encoder.encode(sseEvent("chunk", { text: token }))
          );
        }

        // 9. Build citations
        const citations: PipelineCitation[] = assembledSections.map(
          (section, i) => ({
            index: i + 1,
            chunkId: section.anchorChunkId,
            sectionId: section.sectionId,
            bookTitle: "",
            sectionPath: section.sectionPath,
            excerpt: section.content.slice(0, 200),
            page: section.page,
          })
        );

        controller.enqueue(
          encoder.encode(sseEvent("citations", { citations }))
        );

        // 10. Save assistant message
        const citationChunkIds = assembledSections.map(
          (s) => s.anchorChunkId as Id<"chunks">
        );

        const messageId = await convex.mutation(api.messages.send, {
          sessionId: sessionId as Id<"chatSessions">,
          role: "assistant",
          content: fullAnswer,
          citationChunkIds,
        });

        controller.enqueue(
          encoder.encode(sseEvent("done", { messageId }))
        );

        // 11. Auto-generate title if first exchange
        if (messages.length <= 1) {
          generateTitle(
            sessionId as Id<"chatSessions">,
            query,
            fullAnswer
          ).catch(console.error);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "An error occurred";
        console.error("RAG pipeline error:", errorMessage);
        if (error instanceof Error && error.stack) {
          console.error("Stack trace:", error.stack);
        }
        controller.enqueue(
          encoder.encode(
            sseEvent("error", { message: errorMessage })
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function generateTitle(
  sessionId: Id<"chatSessions">,
  userMessage: string,
  assistantMessage: string
) {
  try {
    const data = await retryWithBackoff(
      async () => {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content:
                    "Generate a concise 3-6 word title for this conversation. Return only the title, nothing else.",
                },
                {
                  role: "user",
                  content: `User asked: "${userMessage.slice(0, 200)}"\nAssistant answered: "${assistantMessage.slice(0, 200)}"`,
                },
              ],
              max_tokens: 20,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Title generation failed: ${error}`);
        }

        return response.json();
      },
      { label: "Title generation" }
    );

    const title = data.choices[0].message.content.trim();
    await convex.mutation(api.chatSessions.updateTitle, {
      id: sessionId,
      title,
    });
  } catch (error) {
    console.error("Title generation failed:", error);
  }
}
