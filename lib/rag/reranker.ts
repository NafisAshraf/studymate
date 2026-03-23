import { retryWithBackoff } from "./retry";
import type { RetrievedChunk } from "./types";

interface RerankResult {
  index: number;
  relevance_score: number;
}

export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  minCount: number = 3,
  maxCount: number = 8,
  threshold: number = 0.5
): Promise<RetrievedChunk[]> {
  const documents = chunks.map((c) => c.embeddingText);

  const data = await retryWithBackoff(
    async () => {
      const response = await fetch(
        "https://api.fireworks.ai/inference/v1/rerank",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "accounts/fireworks/models/qwen3-reranker-8b",
            query,
            documents,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Reranking failed: ${error}`);
      }

      return response.json();
    },
    { label: "Reranker" }
  );

  const results: RerankResult[] = data.data ?? data.results;

  // Sort by relevance score descending
  results.sort((a, b) => b.relevance_score - a.relevance_score);

  // Take chunks above threshold, respecting min/max bounds
  const selected: RetrievedChunk[] = [];
  for (const result of results) {
    if (selected.length >= maxCount) break;
    if (
      selected.length >= minCount &&
      result.relevance_score < threshold
    ) {
      break;
    }
    selected.push({
      ...chunks[result.index],
      score: result.relevance_score,
    });
  }

  return selected;
}
