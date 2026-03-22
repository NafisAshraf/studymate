"use client";

import { BookOpen } from "lucide-react";

export function SidebarLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 bg-accent rounded-[6px_6px_6px_16px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
      </div>
      <span className="font-[family-name:var(--font-display)] text-[17px] italic">
        <span className="text-accent">Study</span>
        <span className="text-accent-secondary">Mate</span>
      </span>
    </div>
  );
}
