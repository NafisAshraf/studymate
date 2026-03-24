import { retryWithBackoff } from "./retry";
import type { RetrievedChunk } from "./types";
import type { StepMetrics } from "./types";

interface RerankResult {
  index: number;
  relevance_score: number;
}

const FIREWORKS_RERANK_MODEL = "accounts/fireworks/models/qwen3-reranker-8b";
const QWEN3_RERANKER_USD_PER_MILLION_TOKENS = 0.2;

export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  minCount: number = 3,
  maxCount: number = 8,
  threshold: number = 0.5
): Promise<{ chunks: RetrievedChunk[]; metrics: StepMetrics }> {
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
            model: FIREWORKS_RERANK_MODEL,
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

  const usage = data?.usage ?? data?.token_usage ?? data?.billed_units;
  const inputTokens =
    typeof usage?.prompt_tokens === "number"
      ? usage.prompt_tokens
      : typeof usage?.input_tokens === "number"
        ? usage.input_tokens
        : typeof usage?.tokens === "number"
          ? usage.tokens
          : undefined;
  const outputTokens =
    typeof usage?.completion_tokens === "number"
      ? usage.completion_tokens
      : typeof usage?.output_tokens === "number"
        ? usage.output_tokens
        : undefined;
  const totalTokens =
    typeof usage?.total_tokens === "number"
      ? usage.total_tokens
      : inputTokens != null || outputTokens != null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined;
  const cost =
    typeof usage?.cost === "number"
      ? usage.cost
      : typeof data?.cost === "number"
        ? data.cost
        : typeof data?.usage_cost === "number"
          ? data.usage_cost
          : undefined;

  const model =
    typeof data?.model === "string" ? data.model : FIREWORKS_RERANK_MODEL;
  const fallbackCostUsd =
    cost == null &&
    totalTokens != null &&
    model.includes("qwen3-reranker-8b")
      ? (totalTokens / 1_000_000) * QWEN3_RERANKER_USD_PER_MILLION_TOKENS
      : undefined;
  const finalCost = cost ?? fallbackCostUsd;

  const metrics: StepMetrics = {
    provider: "fireworks",
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    cost: finalCost,
    costUnit: finalCost != null ? "usd" : undefined,
    providerRequestId:
      typeof data?.id === "string"
        ? data.id
        : typeof data?.request_id === "string"
          ? data.request_id
          : undefined,
    usageRaw: usage ? JSON.stringify(usage) : undefined,
  };

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

  return { chunks: selected, metrics };
}
