"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft } from "lucide-react";
import { BookViewer } from "@/components/books/BookViewer";

export default function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const bookId = id as Id<"books">;
  const book = useQuery(api.books.get, { id: bookId });

  if (book === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
      </div>
    );
  }

  if (book === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary text-[14px] font-[family-name:var(--font-body)]">
          Book not found
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 pt-16 md:pt-8">
        <Link
          href="/books"
          className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-[13px] font-[family-name:var(--font-body)] mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Books
        </Link>

        <h1 className="font-[family-name:var(--font-display)] text-[24px] text-text-primary italic mb-8">
          {book.title}
        </h1>

        <BookViewer bookId={bookId} />
      </div>
    </div>
  );
}
