"use client";

import { Check, Loader2 } from "lucide-react";

const STEPS = [
  { key: "hyde", label: "Rewriting query" },
  { key: "embedding", label: "Embedding query" },
  { key: "searching", label: "Searching books" },
  { key: "reranking", label: "Ranking results" },
  { key: "assembling", label: "Assembling context" },
  { key: "generating", label: "Generating answer" },
];

interface StreamingIndicatorProps {
  currentStep: string;
}

export function StreamingIndicator({ currentStep }: StreamingIndicatorProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex flex-col gap-1 py-2">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;

        if (!isDone && !isActive) return null;

        return (
          <div
            key={step.key}
            className="flex items-center gap-2 text-[11px] font-[family-name:var(--font-body)]"
          >
            {isDone ? (
              <Check className="w-3 h-3 text-accent-secondary" />
            ) : (
              <Loader2 className="w-3 h-3 text-accent animate-spin" />
            )}
            <span
              className={isDone ? "text-accent-secondary" : "text-accent"}
            >
              {step.label}
              {isDone ? "" : "..."}
            </span>
          </div>
        );
      })}
    </div>
  );
}
