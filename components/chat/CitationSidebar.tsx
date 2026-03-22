"use client";

import { X, BookOpen, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import type { Citation } from "./ChatView";

interface CitationSidebarProps {
  citations: Citation[];
  highlightedIndex: number | null;
  onClose: () => void;
}

export function CitationSidebar({
  citations,
  highlightedIndex,
  onClose,
}: CitationSidebarProps) {
  const highlightedRef = useRef<HTMLDivElement>(null);
  const [overlayChunkId, setOverlayChunkId] = useState<string | null>(null);
  const [overlaySectionId, setOverlaySectionId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightedRef.current && highlightedIndex !== null) {
      highlightedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [highlightedIndex]);

  const handleSourceClick = useCallback((citation: Citation) => {
    if (citation.sectionId) {
      setOverlaySectionId(citation.sectionId);
      setOverlayChunkId(citation.chunkId);
    }
  }, []);

  return (
    <>
      <div className="fixed inset-y-0 right-0 z-30 w-[85vw] max-w-80 md:relative md:w-80 md:z-auto bg-bg-secondary border-l border-border-subtle flex flex-col h-full overflow-hidden shadow-2xl md:shadow-none">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h3 className="text-text-primary font-semibold text-[13px] font-[family-name:var(--font-body)]">
            Sources
          </h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {citations.map((citation) => {
            const isHighlighted = citation.index === highlightedIndex;
            return (
              <div
                key={citation.index}
                ref={isHighlighted ? highlightedRef : undefined}
                onClick={() => handleSourceClick(citation)}
                className={`rounded-lg p-3 transition-all cursor-pointer hover:brightness-110 ${
                  isHighlighted
                    ? "bg-accent-muted border border-accent/30 ring-1 ring-accent/20"
                    : "bg-bg-surface border border-border-subtle hover:border-border"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className={`font-bold text-[10px] font-[family-name:var(--font-body)] ${
                      isHighlighted ? "text-accent-secondary" : "text-accent"
                    }`}
                  >
                    [{citation.index}]
                  </span>
                  {citation.bookTitle && (
                    <span className="text-text-primary text-[11px] font-medium font-[family-name:var(--font-body)] flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-accent" />
                      {citation.bookTitle}
                    </span>
                  )}
                </div>

                {citation.sectionPath && (
                  <div className="flex items-center gap-0.5 mb-2 flex-wrap">
                    {citation.sectionPath
                      .split(" > ")
                      .map((part, i, arr) => (
                        <span key={i} className="flex items-center gap-0.5">
                          <span className="text-text-muted text-[9px] font-[family-name:var(--font-body)]">
                            {part}
                          </span>
                          {i < arr.length - 1 && (
                            <ChevronRight className="w-2.5 h-2.5 text-text-muted opacity-50" />
                          )}
                        </span>
                      ))}
                  </div>
                )}

                <p className="text-text-secondary text-[11px] font-[family-name:var(--font-body)] leading-relaxed line-clamp-4">
                  {citation.excerpt}
                </p>

                {citation.page !== undefined && (
                  <div className="mt-2 text-text-muted text-[9px] font-[family-name:var(--font-body)]">
                    Page {citation.page + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section overlay */}
      {overlaySectionId && (
        <SectionOverlay
          sectionId={overlaySectionId as Id<"sections">}
          highlightChunkId={overlayChunkId}
          onClose={() => {
            setOverlaySectionId(null);
            setOverlayChunkId(null);
          }}
        />
      )}
    </>
  );
}

// ─── Section Overlay Component ───────────────────────────────────────────────

interface SectionOverlayProps {
  sectionId: Id<"sections">;
  highlightChunkId: string | null;
  onClose: () => void;
}

function SectionOverlay({
  sectionId,
  highlightChunkId,
  onClose,
}: SectionOverlayProps) {
  const section = useQuery(api.sections.get, { id: sectionId });
  const chunks = useQuery(api.chunks.bySectionOrdered, { sectionId });
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to highlighted chunk after render
    const timer = setTimeout(() => {
      highlightRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightChunkId, chunks]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-bg-surface border border-border rounded-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-[family-name:var(--font-display)] text-[18px] text-text-primary italic truncate">
              {section?.title ?? "Loading..."}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!chunks ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            </div>
          ) : chunks.length === 0 ? (
            <p className="text-text-muted text-[13px] font-[family-name:var(--font-body)]">
              No content found in this section.
            </p>
          ) : (
            <div className="space-y-1">
              {chunks.map((chunk: Doc<"chunks">) => {
                const isHighlighted = chunk._id === highlightChunkId;
                return (
                  <div
                    key={chunk._id}
                    ref={isHighlighted ? highlightRef : undefined}
                    className={`rounded-lg px-3 py-2 transition-all ${
                      isHighlighted
                        ? "bg-accent-muted border border-accent/30 ring-1 ring-accent/20"
                        : ""
                    }`}
                  >
                    <div
                      className="text-[13px] font-[family-name:var(--font-body)] text-text-primary leading-relaxed prose-studymate"
                      dangerouslySetInnerHTML={{ __html: chunk.html }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
