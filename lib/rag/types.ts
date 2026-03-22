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

export interface SSEEvent {
  event: "status" | "chunk" | "citations" | "done" | "error";
  data: Record<string, unknown>;
}
