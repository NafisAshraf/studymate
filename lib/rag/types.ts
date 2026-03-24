export interface RAGContext {
  sessionId: string;
  query: string;
}

export interface RetrievedChunk {
  _id: string;
  bookId: string;
  sectionId: string;
  content: string;
  html: string;
  sectionPath: string;
  embeddingText: string;
  page: number;
  blockType: string;
  score: number;
}

export interface AssembledSection {
  sectionId: string;
  sectionPath: string;
  content: string;
  anchorChunkId: string;
  page: number;
}

export interface PipelineCitation {
  index: number;
  chunkId: string;
  sectionId: string;
  bookTitle: string;
  sectionPath: string;
  excerpt: string;
  page: number;
}

export type PipelineStepName =
  | "query_rewrite"
  | "search"
  | "rerank"
  | "generate";

export type ProviderName = "openrouter" | "fireworks";
export type CostUnit = "credits" | "usd" | "unknown";

export interface StepMetrics {
  provider?: ProviderName;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  costUnit?: CostUnit;
  providerRequestId?: string;
  usageRaw?: string;
}

export interface CollectedPipelineStep extends StepMetrics {
  stepIndex: number;
  stepName: PipelineStepName;
  durationMs: number;
  data: string;
}

export interface SSEEvent {
  event: "step_complete" | "chunk" | "images" | "citations" | "done" | "error";
  data: Record<string, unknown>;
}
