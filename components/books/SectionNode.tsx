"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { ContentBlock } from "./ContentBlock";

interface SectionNodeProps {
  sectionId: Id<"sections">;
  level: number;
  imageUrlMap: Record<string, string>;
}

export function SectionNode({ sectionId, level, imageUrlMap }: SectionNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const section = useQuery(api.sections.get, { id: sectionId });
  const children = useQuery(
    api.sections.children,
    isOpen ? { parentSectionId: sectionId } : "skip"
  );
  const chunks = useQuery(
    api.chunks.bySectionOrdered,
    isOpen ? { sectionId } : "skip"
  );

  if (section === undefined) {
    return null;
  }

  if (section === null) {
    return null;
  }

  const hasChildren = children && children.length > 0;
  const hasChunks = chunks && chunks.length > 0;

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left flex items-center gap-2 py-2 px-3 rounded-lg bg-bg-surface hover:bg-bg-hover transition-colors cursor-pointer ${
          isOpen ? "text-text-primary" : "text-text-secondary"
        }`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
      >
        <span className="text-[11px] text-text-muted flex-shrink-0">
          {isOpen ? "▼" : "▶"}
        </span>
        <span className="font-[family-name:var(--font-body)] text-[13px] font-medium truncate">
          {section.title}
        </span>
      </button>

      {isOpen && (
        <div>
          {hasChildren &&
            children.map((child: Doc<"sections">) => (
              <SectionNode
                key={child._id}
                sectionId={child._id}
                level={level + 1}
                imageUrlMap={imageUrlMap}
              />
            ))}

          {hasChunks &&
            !hasChildren &&
            chunks.map((chunk: Doc<"chunks">) => (
              <div
                key={chunk._id}
                style={{ paddingLeft: `${(level + 1) * 20 + 12}px` }}
                className="py-2 pr-3"
              >
                <ContentBlock
                  html={chunk.html}
                  blockType={chunk.blockType}
                  imageUrlMap={imageUrlMap}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
