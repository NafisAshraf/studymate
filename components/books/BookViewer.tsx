"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { SectionNode } from "./SectionNode";

interface BookViewerProps {
  bookId: Id<"books">;
}

export function BookViewer({ bookId }: BookViewerProps) {
  const rootSections = useQuery(api.sections.rootSections, { bookId });

  if (rootSections === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
      </div>
    );
  }

  if (rootSections.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-secondary text-[13px] font-[family-name:var(--font-body)]">
          No sections found
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {rootSections.map((section: Doc<"sections">) => (
        <SectionNode key={section._id} sectionId={section._id} level={0} />
      ))}
    </div>
  );
}
