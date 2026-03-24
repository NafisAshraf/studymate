import type { RetrievedChunk } from "./types";

export function reciprocalRankFusion(
  vectorResults: RetrievedChunk[],
  keywordResults: RetrievedChunk[],
  k: number = 60
): RetrievedChunk[] {
  const scoreMap = new Map<string, { chunk: RetrievedChunk; score: number }>();

  for (const [i, chunk] of vectorResults.entries()) {
    scoreMap.set(chunk._id, { chunk, score: 1 / (k + i + 1) });
  }

  for (const [i, chunk] of keywordResults.entries()) {
    const rrfScore = 1 / (k + i + 1);
    const existing = scoreMap.get(chunk._id);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(chunk._id, { chunk, score: rrfScore });
    }
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}
