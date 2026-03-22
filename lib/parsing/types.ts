export interface ParsedSection {
  datalabId: string;
  title: string;
  htmlTag: string;
  level: number;
  parentDatalabId: string | null; // parent section's datalabId
  order: number;
  page: number;
}

export interface ParsedChunk {
  datalabId: string;
  blockType: string;
  content: string; // plain text for embedding
  html: string; // original HTML for rendering
  page: number;
  order: number;
  parentSectionDatalabId: string; // deepest section header
  sectionPath: string; // breadcrumb like "Book > Chapter > Section"
  embeddingText: string; // sectionPath + "\n\n" + content
}

export interface ParsedBook {
  title: string;
  pageCount: number;
  sections: ParsedSection[];
  chunks: ParsedChunk[];
}
