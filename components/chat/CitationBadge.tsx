"use client";

interface CitationBadgeProps {
  index: number;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function CitationBadge({
  index,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: CitationBadgeProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-accent-muted text-accent-secondary text-[10px] font-semibold rounded cursor-pointer hover:bg-accent/20 transition-colors align-super ml-0.5 font-[family-name:var(--font-body)]"
    >
      {index}
    </button>
  );
}
