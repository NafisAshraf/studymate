"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronRight } from "lucide-react";

export interface PipelineStepUI {
  stepName: string;
  stepIndex: number;
  durationMs: number;
  data: string;
  provider?: "openrouter" | "fireworks";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  costUnit?: "credits" | "usd" | "unknown";
  providerRequestId?: string;
  usageRaw?: string;
  status: "pending" | "active" | "complete";
}

interface PipelineTimelineProps {
  steps: PipelineStepUI[];
  isComplete: boolean;
  defaultCollapsed?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  query_rewrite: "Query Rewrite",
  search: "Search",
  rerank: "Rerank",
  generate: "Generate Answer",
};

const USD_TO_TAKA_RATE = 125;

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatUsd(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 5 : 3)}`;
}

function formatTaka(value: number): string {
  const taka = value * USD_TO_TAKA_RATE;
  return `Tk ${taka.toFixed(taka < 1 ? 3 : 2)}`;
}

function formatCost(value: number, unit?: "credits" | "usd" | "unknown"): string {
  if (unit === "usd") return `${formatTaka(value)} (${formatUsd(value)})`;
  if (unit === "credits") {
    // OpenRouter reports cost in credits; for display we treat it as USD-equivalent.
    return `${formatTaka(value)} (${value.toFixed(value < 0.01 ? 5 : 3)} credits)`;
  }
  return value.toString();
}

function extractMetricsFromData(data: string): Partial<PipelineStepUI> {
  try {
    const parsed = JSON.parse(data);
    return parsed?.llmMetrics ?? {};
  } catch {
    return {};
  }
}

function getStepCostUsdEquivalent(step: PipelineStepUI): number | null {
  const fallback = extractMetricsFromData(step.data);
  const cost = step.cost ?? fallback.cost;
  const costUnit = step.costUnit ?? fallback.costUnit;
  if (typeof cost !== "number") return null;

  // Treat OpenRouter credits as USD-equivalent for display conversion.
  if (costUnit === "usd" || costUnit === "credits") return cost;
  return null;
}

function StepMetricsBlock({
  step,
}: {
  step: PipelineStepUI;
}) {
  const fallback = extractMetricsFromData(step.data);
  const provider = step.provider ?? fallback.provider;
  const model = step.model ?? fallback.model;
  const inputTokens = step.inputTokens ?? fallback.inputTokens;
  const outputTokens = step.outputTokens ?? fallback.outputTokens;
  const totalTokens = step.totalTokens ?? fallback.totalTokens;
  const cost = step.cost ?? fallback.cost;
  const costUnit = step.costUnit ?? fallback.costUnit;

  if (!provider && !model && inputTokens == null && outputTokens == null && totalTokens == null && cost == null) {
    return null;
  }

  return (
    <div className="mt-1.5 pl-3 border-l-2 border-accent/25 text-[11px] text-text-secondary leading-relaxed">
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {provider && <span className="text-text-muted">{provider}</span>}
        {model && <span className="text-accent-secondary">{model}</span>}
        {inputTokens != null && <span>in {formatNumber(inputTokens)}</span>}
        {outputTokens != null && <span>out {formatNumber(outputTokens)}</span>}
        {totalTokens != null && <span>total {formatNumber(totalTokens)}</span>}
        {cost != null && <span>cost {formatCost(cost, costUnit)}</span>}
      </div>
    </div>
  );
}

function StepOutput({
  step,
  showMetrics,
}: {
  step: PipelineStepUI;
  showMetrics: boolean;
}) {
  const [showMore, setShowMore] = useState(false);
  const stepName = step.stepName;
  const data = step.data;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(data);
  } catch {
    parsed = {};
  }

  if (stepName === "query_rewrite") {
    const text = typeof parsed.hydeText === "string" ? parsed.hydeText : "";
    const truncated = text.length > 200;
    return (
      <div className="mt-1.5 pl-3 border-l-2 border-accent/25 text-[11px] text-text-secondary leading-relaxed">
        <p className="italic">
          &ldquo;{showMore || !truncated ? text : text.slice(0, 200) + "..."}&rdquo;
        </p>
        {truncated && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-accent/70 hover:text-accent text-[10px] mt-1 transition-colors"
          >
            {showMore ? "show less" : "show more"}
          </button>
        )}
        {showMetrics && <StepMetricsBlock step={step} />}
      </div>
    );
  }

  if (stepName === "search") {
    return (
      <div className="mt-1.5 pl-3 border-l-2 border-accent/25 text-[11px] text-text-secondary leading-relaxed">
        <span className="text-accent-secondary">{String(parsed.keywordCount ?? 0)}</span> keyword
        {" · "}
        <span className="text-accent-secondary">{String(parsed.vectorCount ?? 0)}</span> vector
        {" · "}
        <span className="text-accent-secondary">{String(parsed.fusedCount ?? 0)}</span> fused
        {showMetrics && <StepMetricsBlock step={step} />}
      </div>
    );
  }

  if (stepName === "rerank") {
    const chunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];
    const visibleChunks = showMore ? chunks : chunks.slice(0, 3);
    const hiddenCount = chunks.length - 3;

    return (
      <div className="mt-1.5 pl-3 border-l-2 border-accent/25 text-[11px] text-text-secondary leading-relaxed space-y-2">
        {visibleChunks.map((c, i: number) => (
          <RerankChunk
            key={i}
            chunk={c as { sectionPath: string; score: number; excerpt: string }}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-accent/70 hover:text-accent text-[10px] transition-colors"
          >
            {showMore ? "show less" : `+ ${hiddenCount} more sources`}
          </button>
        )}
        {showMetrics && <StepMetricsBlock step={step} />}
      </div>
    );
  }

  if (stepName === "generate") {
    return showMetrics ? <StepMetricsBlock step={step} /> : null;
  }

  return null;
}

function RerankChunk({
  chunk,
}: {
  chunk: { sectionPath: string; score: number; excerpt: string };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-text-secondary/80 truncate flex-1">
          {chunk.sectionPath}
        </span>
        <span className="text-accent-secondary text-[10px] font-medium tabular-nums shrink-0">
          {chunk.score.toFixed(2)}
        </span>
      </div>
      <p className="text-text-muted text-[10px] mt-0.5 leading-relaxed">
        {expanded ? chunk.excerpt : chunk.excerpt.slice(0, 100)}
        {chunk.excerpt.length > 100 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-accent/60 hover:text-accent ml-1 transition-colors"
          >
            {expanded ? "less" : "...more"}
          </button>
        )}
      </p>
    </div>
  );
}

function StepRow({
  step,
  isLast,
  showMetrics,
}: {
  step: PipelineStepUI;
  isLast: boolean;
  showMetrics: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={ref}
      className={`relative transition-all duration-300 ease-out ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      } ${!isLast ? "mb-3.5" : ""}`}
    >
      {/* Dot */}
      <div className="absolute -left-[25px] top-[3px]">
        {step.status === "complete" ? (
          <div className="w-2.5 h-2.5 rounded-full bg-accent" />
        ) : step.status === "active" ? (
          <div className="w-2.5 h-2.5 rounded-full border-[1.5px] border-accent animate-pulse" />
        ) : (
          <div className="w-2.5 h-2.5 rounded-full bg-border-subtle" />
        )}
      </div>

      {/* Label + duration */}
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-[11px] font-medium font-[family-name:var(--font-body)] ${
            step.status === "active"
              ? "text-accent"
              : step.status === "complete"
                ? "text-text-secondary"
                : "text-text-muted"
          }`}
        >
          {STEP_LABELS[step.stepName] || step.stepName}
        </span>
        {step.status === "active" && (
          <span className="text-accent text-[11px]">...</span>
        )}
        {step.status === "complete" && step.durationMs > 0 && (
          <span className="text-[10px] text-text-muted font-[family-name:var(--font-body)]">
            {formatDuration(step.durationMs)}
          </span>
        )}
      </div>

      {/* Output */}
      {step.status === "complete" && <StepOutput step={step} showMetrics={showMetrics} />}
    </div>
  );
}

export function PipelineTimeline({
  steps,
  isComplete,
  defaultCollapsed = false,
}: PipelineTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
  const [showMetrics, setShowMetrics] = useState(false);
  const wasCompleteRef = useRef(isComplete);

  // Auto-collapse after completion
  useEffect(() => {
    if (isComplete && !wasCompleteRef.current && !defaultCollapsed) {
      const timer = setTimeout(() => setIsExpanded(false), 600);
      wasCompleteRef.current = true;
      return () => clearTimeout(timer);
    }
    wasCompleteRef.current = isComplete;
  }, [isComplete, defaultCollapsed]);

  const totalDuration = steps.reduce((sum, s) => sum + s.durationMs, 0);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const hasAnyMetrics = steps.some((step) => {
    if (
      step.provider ||
      step.model ||
      step.inputTokens != null ||
      step.outputTokens != null ||
      step.totalTokens != null ||
      step.cost != null
    ) {
      return true;
    }
    const fallback = extractMetricsFromData(step.data);
    return (
      fallback.provider != null ||
      fallback.model != null ||
      fallback.inputTokens != null ||
      fallback.outputTokens != null ||
      fallback.totalTokens != null ||
      fallback.cost != null
    );
  });

  const totalCostUsd = steps.reduce((sum, step) => {
    const stepCost = getStepCostUsdEquivalent(step);
    return stepCost != null ? sum + stepCost : sum;
  }, 0);
  const hasTotalCost = steps.some((step) => getStepCostUsdEquivalent(step) != null);

  if (steps.length === 0) return null;

  return (
    <div className="py-1.5 font-[family-name:var(--font-body)]">
      {/* Collapsed / Header bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={toggleExpand}
          className="flex-1 flex items-center gap-2 text-[12px] text-text-muted cursor-pointer py-1 hover:text-text-secondary transition-colors text-left group"
        >
          <ChevronRight
            className={`w-3 h-3 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            } group-hover:text-accent/60`}
          />
          <span>
            {isComplete
              ? `Completed ${steps.length} steps`
              : `Running step ${steps.length} of 4`}
          </span>
          {isComplete && totalDuration > 0 && (
            <span className="text-[10px] text-text-muted/70">
              · {formatDuration(totalDuration)}
            </span>
          )}
        </button>
        {hasAnyMetrics && (
          <button
            onClick={() => setShowMetrics((prev) => !prev)}
            className="text-[10px] text-text-muted/80 hover:text-accent transition-colors"
          >
            {showMetrics ? "Hide LLM metrics" : "Show LLM metrics"}
          </button>
        )}
      </div>

      {/* Expandable timeline content */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-l-[1.5px] border-border-subtle ml-[5px] pl-5 pt-2 pb-1">
            {steps.map((step, i) => (
              <StepRow
                key={step.stepName}
                step={step}
                isLast={i === steps.length - 1}
                showMetrics={showMetrics}
              />
            ))}
            {isComplete && showMetrics && hasTotalCost && (
              <div className="mt-1.5 pl-3 border-l-2 border-accent/25 text-[11px] text-text-secondary leading-relaxed">
                <span className="text-text-muted">Total generation cost</span>
                {" "}
                <span className="text-accent-secondary">{formatTaka(totalCostUsd)}</span>
                {" "}
                <span className="text-text-muted/80">({formatUsd(totalCostUsd)})</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
