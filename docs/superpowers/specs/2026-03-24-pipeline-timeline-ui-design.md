# Pipeline Timeline UI — Design Spec

## Context

The RAG pipeline currently shows a simple step indicator (spinning icons with labels) during generation, with no output data for each step and no persistence. Users cannot see what the pipeline actually did — e.g., what query was rewritten to, which chunks were found, or how they scored. After generation completes, all trace of the pipeline steps disappears.

This spec adds a **visual pipeline timeline** showing each step's output, persisted in Convex so it's viewable when revisiting old conversations. Inspired by Perplexity/Claude's tool call displays.

## Design Decisions

| Decision | Choice |
|---|---|
| Step granularity | 4 grouped steps: Query Rewrite → Search → Rerank → Generate |
| Layout | Vertical timeline with connecting dots/line |
| Step output style | Left-border accent (blockquote-like, not cards) |
| Collapse behavior | Auto-collapse after completion, expandable accordion |
| Persistence | Stored in Convex `pipelineSteps` table |
| Streaming | Only final LLM answer is streamed; step outputs appear when done |

## 1. Schema Changes

### New table: `pipelineSteps`

**File:** `convex/schema.ts`

```
pipelineSteps: defineTable({
  messageId: v.id("messages"),
  sessionId: v.id("chatSessions"),
  stepIndex: v.number(),           // 0-3
  stepName: v.string(),            // "query_rewrite" | "search" | "rerank" | "generate"
  durationMs: v.number(),
  data: v.string(),                // JSON-serialized step output
}).index("by_messageId", ["messageId"])
  .index("by_sessionId", ["sessionId"])
```

**Data shapes (JSON-serialized in `data` field):**
- `query_rewrite`: `{ hydeText: string }`
- `search`: `{ keywordCount: number, vectorCount: number, fusedCount: number }`
- `rerank`: `{ chunks: Array<{ sectionPath: string, score: number, excerpt: string }> }`
- `generate`: `{ totalDurationMs: number }`

Rationale: `v.string()` for data avoids complex union validators and stays well under 1MB.

### New Convex file: `convex/pipelineSteps.ts`

- `batchInsert` mutation: takes array of step objects, inserts all 4 at once (1 round-trip)
- `byMessage` query: fetches steps by messageId using `by_messageId` index, ordered by stepIndex, `.take(10)`

## 2. API Route Changes

**File:** `app/api/chat/route.ts`

### Pipeline restructure

Current flow runs HyDE inside the parallel search block. New flow separates HyDE as its own emitted step:

```
1. Save user message + fetch history
2. HyDE generation → emit step_complete(query_rewrite)
3. Parallel: [keyword search, embed HyDE + vector search] → RRF fusion → emit step_complete(search)
4. Rerank → emit step_complete(rerank)
5. Section assembly + image resolution
6. Stream answer → emit step_complete(generate)
7. Save assistant message + persist pipeline steps via batchInsert
```

This adds ~200-400ms latency (HyDE is no longer fully parallel with keyword) but is required to show step-by-step progression.

### New SSE event: `step_complete`

Replaces the current 3 `status` events. Each carries:
```json
{
  "step": "query_rewrite",
  "stepIndex": 0,
  "durationMs": 823,
  "data": { "hydeText": "..." }
}
```

The `status` event type is removed. The `chunk`, `images`, `citations`, `done`, `error` events remain unchanged.

### Timing

Wrap each phase in `performance.now()` to capture `durationMs`.

### Persistence

After getting `messageId` from saving the assistant message, call `pipelineSteps.batchInsert` with all 4 collected steps. Collected in a local array during pipeline execution.

## 3. Frontend Components

### New: `PipelineTimeline.tsx`

**File:** `components/chat/PipelineTimeline.tsx`

**Props:**
```typescript
interface PipelineStepUI {
  stepName: string;
  stepIndex: number;
  durationMs: number;
  data: string; // JSON
  status: "pending" | "active" | "complete";
}

interface PipelineTimelineProps {
  steps: PipelineStepUI[];
  isComplete: boolean;
  defaultCollapsed?: boolean;  // true for persisted messages
}
```

**Visual structure:**
- Outer: vertical left-border line (1.5px `border-border-subtle`) connecting step dots
- Each step row: filled green dot (complete), pulsing ring (active), or hollow dot (pending)
- Step label + duration badge inline
- Output area: indented with a left-border accent (`border-l-2 border-accent/25`)
- Muted text color for output content (`text-text-muted`)

**Step output renderers:**
1. **Query Rewrite**: HyDE text in italic muted text (truncated to ~3 lines with "show more")
2. **Search**: Inline text — "12 keyword · 18 vector · 20 fused"
3. **Rerank**: List of chunks showing sectionPath, score (green), excerpt (~100 chars). "Show more" per chunk for full excerpt. "+ N more sources" toggle if >3 chunks.
4. **Generate**: Just the label — actual answer renders below as a ChatMessage.

**Collapse/expand:**
- `isExpanded` state, default `true` during streaming, `false` when `defaultCollapsed`
- When `isComplete` becomes true, 600ms delay → auto-collapse with animation
- Collapsed: "Completed 4 steps · 3.2s" with ChevronRight icon
- Click toggles expand/collapse

### Modified: `ChatView.tsx`

**State changes:**
- Remove `streamStatus: string | null`
- Add `pipelineSteps: PipelineStepUI[]` and `pipelineComplete: boolean`

**SSE handler:**
- Handle `step_complete` event: append to `pipelineSteps`, mark previous as complete, new as complete
- On `done`: set `pipelineComplete = true`

**Rendering:**
- Remove `<StreamingIndicator>` usage
- During streaming: render `<PipelineTimeline>` above the streaming `ChatMessage`
- Pass `msg._id` as `messageId` prop to persisted `ChatMessage` components

### Modified: `ChatMessage.tsx`

- New optional prop: `messageId?: Id<"messages">`
- For persisted assistant messages (not streaming, has messageId): call `useQuery(api.pipelineSteps.byMessage, { messageId })`
- If steps exist, render `<PipelineTimeline steps={...} isComplete={true} defaultCollapsed={true} />` above the markdown content
- The timeline is inside the assistant message container, before the prose content

### Deleted: `StreamingIndicator.tsx`

Fully replaced by `PipelineTimeline`.

### Modified: `lib/rag/types.ts`

Add `StepCompleteEvent` type and update `SSEEvent` union to include `"step_complete"`.

## 4. Animations

CSS-only approach using Tailwind utilities (no external animation library):

| Animation | Technique |
|---|---|
| Step appearance | `transition-all duration-300 ease-out` with `opacity-0 translate-y-1` → `opacity-100 translate-y-0` |
| Collapse/expand | CSS grid trick: `grid-rows-[1fr]` ↔ `grid-rows-[0fr]` with `transition-[grid-template-rows] duration-300` + inner `overflow-hidden` |
| Active dot pulse | Tailwind `animate-pulse` on ring element |
| Chevron rotation | `transition-transform duration-200` with `rotate-0` / `rotate-90` |
| "Show more" expand | Same grid-row technique for smooth height animation |

## 5. Persisted Message Loading

1. User visits old session → `useQuery(api.messages.bySession)` loads messages
2. Each assistant `ChatMessage` receives its `msg._id`
3. Inside `ChatMessage`, `useQuery(api.pipelineSteps.byMessage, { messageId })` loads steps
4. Renders `<PipelineTimeline defaultCollapsed={true}>` above markdown content
5. User clicks collapsed bar to expand and review pipeline details

Messages sent before this feature won't have pipeline steps — the component handles this by not rendering the timeline when no steps exist.

## 6. File Change Summary

| File | Action | What Changes |
|---|---|---|
| `convex/schema.ts` | Modify | Add `pipelineSteps` table |
| `convex/pipelineSteps.ts` | Create | `batchInsert` mutation + `byMessage` query |
| `lib/rag/types.ts` | Modify | Add `StepCompleteEvent` type, update `SSEEvent` |
| `app/api/chat/route.ts` | Modify | Restructure pipeline, add timing, emit `step_complete` events, persist steps |
| `components/chat/PipelineTimeline.tsx` | Create | New timeline component with collapse/expand, animations, step renderers |
| `components/chat/ChatView.tsx` | Modify | Replace `streamStatus` state with `pipelineSteps`, handle new SSE events, remove StreamingIndicator |
| `components/chat/ChatMessage.tsx` | Modify | Add `messageId` prop, load persisted steps, render PipelineTimeline for assistant messages |
| `components/chat/StreamingIndicator.tsx` | Delete | Replaced by PipelineTimeline |

## 7. Implementation Order

1. Schema + Convex functions (`schema.ts`, `pipelineSteps.ts`)
2. Types (`lib/rag/types.ts`)
3. API route restructure + new SSE events + persistence (`route.ts`)
4. PipelineTimeline component (`PipelineTimeline.tsx`)
5. ChatView + ChatMessage integration
6. Delete StreamingIndicator
7. Polish animations, test end-to-end

## 8. Verification

1. Upload a book and wait for "ready" status
2. Start a new chat session, ask a question
3. Verify: steps appear one-by-one during pipeline execution
4. Verify: each step shows its output (HyDE text, search counts, reranked chunks with scores/excerpts)
5. Verify: after answer completes, timeline auto-collapses with animation
6. Verify: clicking collapsed bar re-expands the timeline
7. Verify: "show more" on reranked chunks reveals full excerpt
8. Refresh the page, navigate back to the same session
9. Verify: persisted messages show collapsed timeline that can be expanded
10. Verify: smooth animations throughout (no layout jumps)
