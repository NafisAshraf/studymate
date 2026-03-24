import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { generateHyDE } from "@/lib/rag/hyde";
import { embedText } from "@/lib/rag/embeddings";
import { rerankChunks } from "@/lib/rag/reranker";
import { streamAnswer } from "@/lib/rag/generator";
import { retryWithBackoff } from "@/lib/rag/retry";
import { cleanQueryForKeywordSearch } from "@/lib/rag/keywordSearch";
import { reciprocalRankFusion } from "@/lib/rag/fusion";
import type {
  CollectedPipelineStep,
  RetrievedChunk,
  AssembledSection,
  PipelineCitation,
  StepMetrics,
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
        const collectedSteps: CollectedPipelineStep[] = [];

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

        // 3. Step 0: Query Rewrite (HyDE)
        const t0 = performance.now();
        const hydeResult = await generateHyDE(query, history);
        const hydeText = hydeResult.text;
        const hydeMs = Math.round(performance.now() - t0);
        const step0Data = {
          hydeText,
          llmMetrics: hydeResult.metrics,
        };

        const step0 = {
          stepIndex: 0,
          stepName: "query_rewrite",
          durationMs: hydeMs,
          ...hydeResult.metrics,
          data: JSON.stringify(step0Data),
        };
        collectedSteps.push(step0);
        controller.enqueue(
          encoder.encode(
            sseEvent("step_complete", {
              step: "query_rewrite",
              stepIndex: 0,
              durationMs: hydeMs,
              ...hydeResult.metrics,
              data: step0Data,
            })
          )
        );

        // 4. Step 1: Hybrid Search (keyword + vector in parallel, then fusion)
        const t1 = performance.now();

        const [keywordResults, vectorResults] = await Promise.all([
          (async () => {
            const cleanedQuery = cleanQueryForKeywordSearch(query);
            const results = await convex.query(api.chunks.textSearch, {
              query: cleanedQuery,
              limit: 20,
            });
            return results as RetrievedChunk[];
          })(),
          (async () => {
            const queryEmbedding = await embedText(hydeText);
            return (await convex.action(api.chunks.vectorSearch, {
              embedding: queryEmbedding,
              limit: 20,
            })) as RetrievedChunk[];
          })(),
        ]);

        const fusedResults = reciprocalRankFusion(vectorResults, keywordResults);
        const searchResults = fusedResults.slice(0, 20);
        const searchMs = Math.round(performance.now() - t1);

        const step1 = {
          stepIndex: 1,
          stepName: "search",
          durationMs: searchMs,
          data: JSON.stringify({
            keywordCount: keywordResults.length,
            vectorCount: vectorResults.length,
            fusedCount: searchResults.length,
          }),
        };
        collectedSteps.push(step1);
        controller.enqueue(
          encoder.encode(
            sseEvent("step_complete", {
              step: "search",
              stepIndex: 1,
              durationMs: searchMs,
              data: {
                keywordCount: keywordResults.length,
                vectorCount: vectorResults.length,
                fusedCount: searchResults.length,
              },
            })
          )
        );

        // Early exit: no results
        if (searchResults.length === 0) {
          const noResultMsg = "I couldn't find any relevant information in your books to answer this question. Please make sure you've uploaded books that cover this topic.";
          const messageId = await convex.mutation(api.messages.send, {
            sessionId: sessionId as Id<"chatSessions">,
            role: "assistant",
            content: noResultMsg,
          });
          // Persist the partial steps we have
          await convex.mutation(api.pipelineSteps.batchInsert, {
            sessionId: sessionId as Id<"chatSessions">,
            messageId,
            steps: collectedSteps,
          });
          controller.enqueue(
            encoder.encode(sseEvent("chunk", { text: noResultMsg }))
          );
          controller.enqueue(
            encoder.encode(sseEvent("done", { messageId }))
          );
          controller.close();
          return;
        }

        // 5. Step 2: Rerank
        const t2 = performance.now();
        const { chunks: rerankedChunks, metrics: rerankMetrics } =
          await rerankChunks(query, searchResults);
        const rerankMs = Math.round(performance.now() - t2);
        const step2Data = {
          chunks: rerankedChunks.map((c) => ({
            sectionPath: c.sectionPath,
            score: c.score,
            excerpt: c.content.slice(0, 150),
          })),
          llmMetrics: rerankMetrics,
        };

        const step2 = {
          stepIndex: 2,
          stepName: "rerank",
          durationMs: rerankMs,
          ...rerankMetrics,
          data: JSON.stringify(step2Data),
        };
        collectedSteps.push(step2);
        controller.enqueue(
          encoder.encode(
            sseEvent("step_complete", {
              step: "rerank",
              stepIndex: 2,
              durationMs: rerankMs,
              ...rerankMetrics,
              data: step2Data,
            })
          )
        );

        // 6. Parent-section assembly
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
              if (c.blockType === "Figure" || c.blockType === "Picture") {
                contentParts.push(
                  filenames.map(f => `[IMAGE: "${c.content}" | file: ${f}]`).join("\n\n")
                );
              } else {
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

        // 6b. Resolve image URLs
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

        // 7. Step 3: Stream answer generation
        const t3 = performance.now();
        let generateMetrics: StepMetrics = {
          provider: "openrouter",
          model: "google/gemini-2.5-flash",
        };

        let fullAnswer = "";
        for await (const token of streamAnswer(
          query,
          assembledSections,
          history,
          Object.keys(imageMap),
          (metrics) => {
            generateMetrics = {
              ...generateMetrics,
              ...metrics,
            };
          }
        )) {
          fullAnswer += token;
          controller.enqueue(
            encoder.encode(sseEvent("chunk", { text: token }))
          );
        }

        const generateMs = Math.round(performance.now() - t3);
        const step3Data = {
          totalDurationMs: generateMs,
          llmMetrics: generateMetrics,
        };
        const step3 = {
          stepIndex: 3,
          stepName: "generate",
          durationMs: generateMs,
          ...generateMetrics,
          data: JSON.stringify(step3Data),
        };
        collectedSteps.push(step3);
        controller.enqueue(
          encoder.encode(
            sseEvent("step_complete", {
              step: "generate",
              stepIndex: 3,
              durationMs: generateMs,
              ...generateMetrics,
              data: step3Data,
            })
          )
        );

        // 8. Build citations
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

        // 9. Emit done early so the UI can collapse the timeline promptly
        controller.enqueue(
          encoder.encode(sseEvent("done", {}))
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

        // 11. Persist pipeline steps
        await convex.mutation(api.pipelineSteps.batchInsert, {
          sessionId: sessionId as Id<"chatSessions">,
          messageId,
          steps: collectedSteps,
        });

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
