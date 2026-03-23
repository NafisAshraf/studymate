import { ParsedBook, ParsedChunk, ParsedSection } from "./types";

// Block types to skip when creating chunks
const SKIP_BLOCK_TYPES = new Set([
  "PageHeader",
  "PageFooter",
  "TableOfContents",
  "SectionHeader",
  "Page", // Page-level containers should never be chunks
]);

// Minimum character length for a chunk's plain-text content to be worth embedding
const MIN_CHUNK_CONTENT_LENGTH = 5;

// Synthetic section ID for orphan blocks that have no section_hierarchy
const ORPHAN_SECTION_ID = "__orphan__";

/**
 * Convert HTML content to plain text, preserving LaTeX from <math> tags.
 *
 * - <math display="block">...</math> becomes $$...$$
 * - <math>...</math> (inline) becomes $...$
 * - All other HTML tags are stripped
 * - HTML entities are decoded
 */
function htmlToPlainText(html: string): string {
  let text = html;

  // Convert block math: <math display="block">...</math>
  text = text.replace(
    /<math\s+display\s*=\s*"block"\s*>([\s\S]*?)<\/math>/gi,
    (_, latex) => `$$${latex.trim()}$$`
  );

  // Convert inline math: <math>...</math>
  text = text.replace(
    /<math>([\s\S]*?)<\/math>/gi,
    (_, latex) => `$${latex.trim()}$`
  );

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace but preserve paragraph breaks (double newlines)
  text = text
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\s+/g, " ").trim())
    .filter((para) => para.length > 0)
    .join("\n\n");

  return text.trim();
}

/**
 * Extract the HTML tag name (e.g. "h1", "h2") from a SectionHeader's html field.
 * Falls back to "h1" if no heading tag is found.
 */
function extractHtmlTag(html: string): string {
  const match = html.match(/<(h[1-6])\b/i);
  return match ? match[1].toLowerCase() : "h1";
}

/**
 * Extract heading level number from an HTML tag like "h1" -> 1, "h2" -> 2, etc.
 */
function tagToLevel(tag: string): number {
  const match = tag.match(/^h(\d)$/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Extract the text title from a SectionHeader's HTML, stripping all tags.
 */
function extractTitle(html: string): string {
  return htmlToPlainText(html);
}

interface DatalabBlock {
  id: string;
  block_type: string;
  html: string;
  page: number;
  polygon: number[][];
  bbox: number[];
  section_hierarchy: Record<string, string>;
  images: Record<string, string>;
  markdown: string | null;
  inference_failed?: boolean;
}

interface DatalabPage {
  id: string;
  block_type: string;
  html: string;
  bbox: number[];
  polygon: number[][];
  children: DatalabBlock[];
}

interface DatalabJson {
  children: DatalabPage[];
  metadata?: {
    page_stats?: Array<{ page_id: number; num_blocks: number }>;
  };
}

interface DatalabApiResponse {
  json: DatalabJson;
  images: Record<string, string>;
  status: string;
  [key: string]: unknown;
}

/**
 * Find the deepest (highest level number) section header ID from a block's
 * section_hierarchy object. Returns the section ID and the level.
 */
function findDeepestSection(
  sectionHierarchy: Record<string, string>
): { id: string; level: number } | null {
  const levels = Object.keys(sectionHierarchy)
    .map((k) => parseInt(k, 10))
    .filter((n) => !isNaN(n));

  if (levels.length === 0) return null;

  const deepest = Math.max(...levels);
  return {
    id: sectionHierarchy[String(deepest)],
    level: deepest,
  };
}

/**
 * Build a breadcrumb-style section path from a block's section_hierarchy,
 * using the section title lookup map.
 */
function buildSectionPath(
  sectionHierarchy: Record<string, string>,
  sectionTitles: Map<string, string>
): string {
  const levels = Object.keys(sectionHierarchy)
    .map((k) => parseInt(k, 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  return levels
    .map((level) => {
      const sectionId = sectionHierarchy[String(level)];
      return sectionTitles.get(sectionId) ?? sectionId;
    })
    .join(" > ");
}

/**
 * Parse a Datalab JSON output into a structured ParsedBook.
 *
 * Walks through all pages and their children blocks to extract:
 * - SectionHeader blocks into ParsedSection[]
 * - Content blocks (Text, Equation, Figure, ListGroup, Picture, Table) into ParsedChunk[]
 * - Skips PageHeader, PageFooter, TableOfContents, SectionHeader, Page
 *
 * Handles edge cases:
 * - Orphan blocks with no section_hierarchy get assigned to a synthetic root section
 * - Blocks with empty/whitespace-only content are skipped
 * - Book title falls back to filename hint or "Untitled" if no h1 found
 */
export function parseDatalab(json: unknown, fileNameHint?: string): ParsedBook {
  let data: DatalabJson;
  let imageFilenames: string[] = [];

  // Detect API vs playground format
  const raw = json as Record<string, unknown>;
  if (raw.json && typeof raw.json === "object") {
    // API format: document tree under .json, images at top level
    const apiResponse = json as DatalabApiResponse;
    data = apiResponse.json;
    imageFilenames = Object.keys(apiResponse.images || {});
  } else {
    // Playground format: document tree directly at root
    data = json as DatalabJson;
    // Collect image filenames from block-level images objects
    if (data.children) {
      const filenameSet = new Set<string>();
      for (const page of data.children) {
        if (!page.children) continue;
        for (const block of page.children) {
          if (block.images) {
            for (const key of Object.keys(block.images)) {
              filenameSet.add(key);
            }
          }
        }
      }
      imageFilenames = Array.from(filenameSet);
    }
  }

  const sections: ParsedSection[] = [];
  const chunks: ParsedChunk[] = [];

  // Map from section datalabId -> title (for building breadcrumbs)
  const sectionTitles = new Map<string, string>();
  // Map from section datalabId -> ParsedSection (for parent lookups)
  const sectionById = new Map<string, ParsedSection>();

  let globalOrder = 0;
  let bookTitle = "";
  let hasOrphanBlocks = false;

  // First pass: collect all SectionHeaders so we can look up parents and titles
  for (const page of data.children) {
    if (!page.children) continue;
    for (const block of page.children) {
      if (block.block_type === "SectionHeader") {
        const htmlTag = extractHtmlTag(block.html);
        const level = tagToLevel(htmlTag);
        const title = extractTitle(block.html);

        // Find parent: look at this section's own section_hierarchy
        // The parent is the deepest entry that is NOT this section itself
        let parentDatalabId: string | null = null;
        if (block.section_hierarchy) {
          const levels = Object.keys(block.section_hierarchy)
            .map((k) => parseInt(k, 10))
            .filter((n) => !isNaN(n))
            .sort((a, b) => b - a); // descending

          for (const l of levels) {
            const candidateId = block.section_hierarchy[String(l)];
            if (candidateId !== block.id) {
              parentDatalabId = candidateId;
              break;
            }
          }
        }

        const section: ParsedSection = {
          datalabId: block.id,
          title,
          htmlTag,
          level,
          parentDatalabId,
          order: globalOrder++,
          page: block.page,
        };

        sections.push(section);
        sectionTitles.set(block.id, title);
        sectionById.set(block.id, section);

        // Capture book title from the first h1
        if (htmlTag === "h1" && !bookTitle) {
          bookTitle = title;
        }
      }
    }
  }

  // Second pass: scan for orphan blocks to decide if we need a synthetic section
  for (const page of data.children) {
    if (!page.children) continue;
    for (const block of page.children) {
      if (SKIP_BLOCK_TYPES.has(block.block_type)) continue;

      const hierarchy = block.section_hierarchy ?? {};
      const deepest = findDeepestSection(hierarchy);
      if (!deepest) {
        // Check if this block has meaningful content before flagging
        const content = htmlToPlainText(block.html);
        if (content.length >= MIN_CHUNK_CONTENT_LENGTH) {
          hasOrphanBlocks = true;
          break;
        }
      }
    }
    if (hasOrphanBlocks) break;
  }

  // Create a synthetic root section for orphan blocks if needed
  if (hasOrphanBlocks) {
    const orphanSection: ParsedSection = {
      datalabId: ORPHAN_SECTION_ID,
      title: "Uncategorized",
      htmlTag: "h1",
      level: 0,
      parentDatalabId: null,
      order: -1, // Sort before everything else
      page: 0,
    };
    sections.unshift(orphanSection);
    sectionTitles.set(ORPHAN_SECTION_ID, "Uncategorized");
    sectionById.set(ORPHAN_SECTION_ID, orphanSection);
  }

  // Third pass: create chunks for content blocks
  for (const page of data.children) {
    if (!page.children) continue;
    for (const block of page.children) {
      if (SKIP_BLOCK_TYPES.has(block.block_type)) continue;

      const content = htmlToPlainText(block.html);

      // Skip blocks with empty content, but keep image blocks (Figure/Picture)
      const isImageBlock =
        block.block_type === "Figure" || block.block_type === "Picture";
      if (content.length < MIN_CHUNK_CONTENT_LENGTH && !isImageBlock) continue;

      const hierarchy = block.section_hierarchy ?? {};

      // Find deepest parent section
      const deepest = findDeepestSection(hierarchy);
      // If no section hierarchy, assign to orphan section
      const parentSectionDatalabId = deepest?.id ?? ORPHAN_SECTION_ID;

      // Build section path breadcrumb
      const sectionPath = buildSectionPath(hierarchy, sectionTitles);

      // Build embedding text
      const embeddingText = sectionPath
        ? `${sectionPath}\n\n${content}`
        : content;

      const chunk: ParsedChunk = {
        datalabId: block.id,
        blockType: block.block_type,
        content,
        html: block.html,
        page: block.page,
        order: globalOrder++,
        parentSectionDatalabId,
        sectionPath,
        embeddingText,
      };

      chunks.push(chunk);
    }
  }

  // Fallback book title
  if (!bookTitle) {
    if (fileNameHint) {
      // Strip extension and clean up
      bookTitle = fileNameHint.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    } else {
      bookTitle = "Untitled Book";
    }
  }

  return {
    title: bookTitle,
    pageCount: data.children.length,
    sections,
    chunks,
    imageFilenames,
  };
}
