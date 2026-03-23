"use client";

import { Check, Loader2, AlertCircle } from "lucide-react";

type Step =
  | "parsing"
  | "uploading_images"
  | "uploading_sections"
  | "uploading_chunks"
  | "embedding"
  | "done"
  | "error";

const STEPS: { key: Step; label: string }[] = [
  { key: "parsing", label: "Parsing document" },
  { key: "uploading_images", label: "Uploading images" },
  { key: "uploading_sections", label: "Uploading sections" },
  { key: "uploading_chunks", label: "Uploading chunks" },
  { key: "embedding", label: "Generating embeddings" },
  { key: "done", label: "Complete" },
];

function getStepState(
  stepKey: Step,
  currentStep: Step
): "completed" | "active" | "pending" {
  if (currentStep === "error") {
    const currentIndex = STEPS.findIndex((s) => s.key === stepKey);
    return currentIndex < STEPS.length ? "pending" : "pending";
  }

  const stepIndex = STEPS.findIndex((s) => s.key === stepKey);
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

interface BookUploadProgressProps {
  currentStep: Step;
  progress: { current: number; total: number } | null;
  errorMessage?: string;
}

export function BookUploadProgress({
  currentStep,
  progress,
  errorMessage,
}: BookUploadProgressProps) {
  const showProgressBar =
    (currentStep === "embedding" || currentStep === "uploading_images") &&
    progress;

  return (
    <div className="space-y-3">
      {STEPS.map((step) => {
        const state =
          currentStep === "error"
            ? (() => {
                const idx = STEPS.findIndex((s) => s.key === step.key);
                const errApproxIdx = STEPS.findIndex(
                  (s) => s.key === "embedding"
                );
                if (idx < errApproxIdx) return "completed" as const;
                return "pending" as const;
              })()
            : getStepState(step.key, currentStep);

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              {state === "completed" ? (
                <Check className="w-4 h-4 text-accent" />
              ) : state === "active" ? (
                <Loader2 className="w-4 h-4 text-accent animate-spin" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-text-muted" />
              )}
            </div>
            <span
              className={`text-[13px] font-[family-name:var(--font-body)] ${
                state === "completed"
                  ? "text-text-secondary"
                  : state === "active"
                    ? "text-text-primary"
                    : "text-text-muted"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}

      {showProgressBar && (
        <div className="ml-8 mt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-[family-name:var(--font-body)] text-text-secondary">
              {progress.current} / {progress.total}
            </span>
            <span className="text-[11px] font-[family-name:var(--font-body)] text-text-muted">
              {Math.round((progress.current / progress.total) * 100)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {currentStep === "error" && (
        <div className="flex items-center gap-2 ml-8 mt-1">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-[12px] font-[family-name:var(--font-body)] text-red-400">
            {errorMessage || "An error occurred during upload"}
          </span>
        </div>
      )}
    </div>
  );
}
