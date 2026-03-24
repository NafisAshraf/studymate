# Hybrid Keyword Search for RAG Pipeline

## Context

The RAG pipeline currently uses vector-only search (HyDE → embedding → Convex vector index). This misses keyword-exact matches — e.g., a student searching for "অধ্যায় ৩" (Chapter 3) or a specific term like "photosynthesis" may get poor results if the embedding doesn't capture the exact term well. Adding BM25-style keyword search via Convex full-text search, running in parallel with the existing dense retrieval, will improve recall and robustness.

## Architecture

```
Original query
├── cleanQuery(stopwords) → Convex textSearch → keyword results ──┐
│                                                                  │
└── HyDE → embedText → vectorSearch → vector results ─────────────┤
                                                                   ↓
                                                          RRF fusion + dedup
                                                                   ↓
                                                              Reranker (existing)
                                                                   ↓
                                                            Context assembly → LLM
```

Key insight: keyword search uses the original cleaned query (not HyDE output), so it runs fully in parallel with the entire HyDE → embed → vectorSearch chain — no added latency.

## Components

### 1. Schema: Search Index (`convex/schema.ts`)

Add to the `chunks` table definition:

```ts
.searchIndex("search_content", {
  searchField: "content",
  filterFields: ["bookId"]
})
```

This enables Convex full-text search on chunk content, filterable by book.

### 2. Convex Query: `textSearch` (`convex/chunks.ts`)

New public query function:

```ts
export const textSearch = query({
  args: {
    query: v.string(),
    bookId: v.optional(v.id("books")),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("chunks")
      .withSearchIndex("search_content", (q) => {
        const search = q.search("content", args.query);
        return args.bookId ? search.eq("bookId", args.bookId) : search;
      })
      .take(args.limit);

    return results.map((chunk, i) => ({
      ...chunk,
      score: 1 - i / args.limit, // positional relevance score
    }));
  },
});
```

Returns full chunk documents with a positional score (1.0 for rank 1, decreasing). This matches the `RetrievedChunk` shape expected by downstream components (reranker, context assembly).

### 3. Stopword Filtering (`lib/rag/keywordSearch.ts`)

Uses the `stopword` npm package which supports both English (`eng`) and Bengali (`ben`).

```ts
import { removeStopwords, eng, ben } from "stopword";

export function cleanQueryForKeywordSearch(query: string): string {
  const tokens = query.split(/\s+/).filter((t) => t.length > 0);
  const cleaned = removeStopwords(tokens, [...eng, ...ben]);
  // Fall back to original if all tokens were stopwords
  if (cleaned.length === 0) return query.trim();
  return cleaned.join(" ");
}
```

Handles mixed Bangla/English queries naturally — the combined stopword list filters both languages in a single pass.

### 4. RRF Fusion (`lib/rag/fusion.ts`)

Reciprocal Rank Fusion merges ranked lists from different retrieval methods:

```ts
score(doc) = Σ 1 / (k + rank_i)
```

Where `k = 60` (standard constant), and `rank_i` is the 1-based position in each result list.

- Chunks appearing in both vector and keyword results get boosted (scores add)
- Deduplicates by chunk `_id`
- Returns results sorted by fused score descending

```ts
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
```

### 5. Pipeline Integration (`app/api/chat/route.ts`)

After saving the user message and fetching history, run both search paths in parallel:

```ts
// Run keyword search (Path A) and dense search (Path B) in parallel
const [keywordResults, vectorResults] = await Promise.all([
  // Path A: keyword search (no HyDE dependency)
  (async () => {
    const cleanedQuery = cleanQueryForKeywordSearch(query);
    return convex.query(api.chunks.textSearch, {
      query: cleanedQuery,
      limit: 20,
    });
  })(),
  // Path B: dense search (existing HyDE → embed → vector pipeline)
  (async () => {
    const hydeText = await generateHyDE(query, history);
    const queryEmbedding = await embedText(hydeText);
    return convex.action(api.chunks.vectorSearch, {
      embedding: queryEmbedding,
      limit: 20,
    });
  })(),
]);

// Fuse results
const fusedResults = reciprocalRankFusion(vectorResults, keywordResults);
const topResults = fusedResults.slice(0, 20);

// Feed to existing reranker
const rerankedChunks = await rerankChunks(query, topResults);
```

SSE status events are sent at appropriate points within each path.

### 6. npm dependency

Install:
```bash
npm install stopword
```

## Edge Cases

- **All stopwords query**: `cleanQueryForKeywordSearch` falls back to the original query
- **Empty keyword results**: RRF handles gracefully — only vector results contribute scores
- **Empty vector results**: RRF handles gracefully — only keyword results contribute scores
- **Both empty**: Existing "no results" handling in route.ts applies (checks `fusedResults.length === 0`)
- **Mixed Bangla/English**: Combined stopword list handles both in a single pass

## Files Modified

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `.searchIndex("search_content", ...)` to chunks table |
| `convex/chunks.ts` | Add `textSearch` query function |
| `lib/rag/keywordSearch.ts` | **New** — stopword filtering for EN + BN |
| `lib/rag/fusion.ts` | **New** — RRF fusion algorithm |
| `app/api/chat/route.ts` | Parallel hybrid search + RRF integration |
| `package.json` | Add `stopword` dependency |

## Verification

1. **TypeScript check**: `npx tsc --noEmit` passes
2. **Convex build**: `npx convex dev --once` deploys schema + functions successfully
3. **Unit verification**: The stopword function correctly filters English and Bangla stopwords from mixed queries
4. **Integration**: Full pipeline runs — keyword search returns results from Convex text search, vector search returns results as before, RRF merges them, reranker scores the fused set
