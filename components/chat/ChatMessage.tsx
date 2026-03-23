"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { CitationBadge } from "./CitationBadge";
import type { Citation } from "./ChatView";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  citationChunkIds?: Id<"chunks">[];
  isStreaming?: boolean;
  streamCitations?: Citation[];
  streamImageMap?: Record<string, string>;
  onCitationClick: (index: number, citations: Citation[]) => void;
  onCitationHover?: (index: number | null, citations: Citation[]) => void;
}

/**
 * Replace img:FILENAME references with real Convex URLs before ReactMarkdown
 * processes them. react-markdown v10 strips unknown URL schemes (like img:),
 * so we must resolve to https:// URLs first.
 */
function resolveImageUrls(content: string, imageMap: Record<string, string>): string {
  if (Object.keys(imageMap).length === 0) return content;
  return content.replace(/!\[([\s\S]*?)\]\(img:([^)\s]+)\)/g, (_, alt, filename) => {
    const url = imageMap[filename];
    if (!url) return "";
    const singleLineAlt = alt.replace(/\s+/g, " ").trim();
    return `![${singleLineAlt}](${url})`;
  });
}

export function ChatMessage({
  role,
  content,
  citationChunkIds,
  isStreaming,
  streamCitations,
  streamImageMap,
  onCitationClick,
  onCitationHover,
}: ChatMessageProps) {
  const chunks = useQuery(
    api.chunks.getMany,
    citationChunkIds && citationChunkIds.length > 0
      ? { ids: citationChunkIds }
      : "skip"
  );

  const messageCitations: Citation[] =
    streamCitations ||
    (chunks
      ? chunks.map((chunk: Doc<"chunks">, i: number) => ({
          index: i + 1,
          chunkId: chunk._id,
          sectionId: chunk.sectionId,
          bookTitle: "",
          sectionPath: chunk.sectionPath,
          excerpt: chunk.content.slice(0, 200),
          page: chunk.page,
        }))
      : []);

  // Derive bookIds from citation chunks for image resolution (persisted messages)
  const bookIds = useMemo(() => {
    if (streamImageMap || !chunks || chunks.length === 0) return [];
    const ids = [...new Set(chunks.map((c: Doc<"chunks">) => c.bookId))];
    return ids;
  }, [chunks, streamImageMap]);

  const bookImages = useQuery(
    api.bookImages.byBooks,
    bookIds.length > 0 ? { bookIds } : "skip"
  );

  const imageMap = useMemo(() => {
    if (streamImageMap && Object.keys(streamImageMap).length > 0) return streamImageMap;
    if (!bookImages || bookImages.length === 0) return {};
    return Object.fromEntries(bookImages.map((img: { filename: string; url: string }) => [img.filename, img.url]));
  }, [streamImageMap, bookImages]);

  // Build a set of valid citation indexes for this message
  const validIndexes = new Set(messageCitations.map((c) => c.index));

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-accent text-black py-2.5 px-4 rounded-[12px_12px_2px_12px] max-w-[70%] text-[13px] font-[family-name:var(--font-body)]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="bg-bg-surface border border-border-subtle py-3 px-4 rounded-xl max-w-[85%] text-[13px]">
        <div className="prose-studymate">
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              img: ({ src, alt }) => {
                if (!src) return null;
                return (
                  <img
                    src={src}
                    alt={alt || ""}
                    className="rounded-lg max-w-full my-2"
                  />
                );
              },
              p: ({ children }) => {
                return (
                  <p>
                    {processChildren(
                      children,
                      messageCitations,
                      validIndexes,
                      onCitationClick,
                      onCitationHover
                    )}
                  </p>
                );
              },
              li: ({ children }) => {
                return (
                  <li>
                    {processChildren(
                      children,
                      messageCitations,
                      validIndexes,
                      onCitationClick,
                      onCitationHover
                    )}
                  </li>
                );
              },
            }}
          >
            {resolveImageUrls(content, imageMap)}
          </ReactMarkdown>
        </div>
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-accent-secondary rounded-sm animate-pulse ml-0.5 align-middle" />
        )}
      </div>
    </div>
  );
}

function processChildren(
  children: React.ReactNode,
  citations: Citation[],
  validIndexes: Set<number>,
  onCitationClick: (index: number, citations: Citation[]) => void,
  onCitationHover?: (index: number | null, citations: Citation[]) => void
): React.ReactNode {
  if (!Array.isArray(children)) {
    if (typeof children === "string") {
      return processTextWithCitations(
        children,
        citations,
        validIndexes,
        onCitationClick,
        onCitationHover
      );
    }
    return children;
  }

  return children.map((child, i) => {
    if (typeof child === "string") {
      return (
        <span key={i}>
          {processTextWithCitations(
            child,
            citations,
            validIndexes,
            onCitationClick,
            onCitationHover
          )}
        </span>
      );
    }
    return child;
  });
}

function processTextWithCitations(
  text: string,
  citations: Citation[],
  validIndexes: Set<number>,
  onCitationClick: (index: number, citations: Citation[]) => void,
  onCitationHover?: (index: number | null, citations: Citation[]) => void
): React.ReactNode {
  const parts = text.split(/(\[\d+\])/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const index = parseInt(match[1]);
      if (validIndexes.has(index)) {
        return (
          <CitationBadge
            key={i}
            index={index}
            onClick={() => onCitationClick(index, citations)}
            onMouseEnter={() => onCitationHover?.(index, citations)}
            onMouseLeave={() => onCitationHover?.(null, citations)}
          />
        );
      }
      return part;
    }
    return part;
  });
}
