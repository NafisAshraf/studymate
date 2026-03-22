"use client";

import { Plus, BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isBooksActive = pathname.startsWith("/books");

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => router.push("/")}
        className="flex items-center justify-center gap-1.5 bg-accent text-black py-2 px-3.5 rounded-lg font-[family-name:var(--font-body)] text-[12px] font-semibold hover:brightness-110 transition-all cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        New Chat
      </button>

      <div>
        <div className="font-[family-name:var(--font-body)] text-text-secondary/60 text-[9px] uppercase tracking-[1.5px] mb-2">
          Library
        </div>
        <Link
          href="/books"
          className={`flex items-center gap-2 py-2 px-2.5 rounded-md text-[12px] font-[family-name:var(--font-body)] transition-colors ${
            isBooksActive
              ? "text-accent-secondary bg-accent-muted border-l-2 border-accent-secondary"
              : "text-text-secondary hover:bg-bg-hover"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Books
        </Link>
      </div>
    </div>
  );
}
