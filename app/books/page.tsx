"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { BookCard } from "@/components/books/BookCard";
import { BookUpload } from "@/components/books/BookUpload";
import { Plus } from "lucide-react";

export default function BooksPage() {
  const books = useQuery(api.books.list);
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 pt-16 md:pt-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-[24px] text-text-primary italic">
            Your Books
          </h1>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-accent text-black py-2 px-4 rounded-lg font-[family-name:var(--font-body)] text-[12px] font-semibold hover:brightness-110 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Book
          </button>
        </div>

        {books === undefined ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-text-secondary text-[14px] font-[family-name:var(--font-body)]">
              No books uploaded yet
            </p>
            <p className="text-text-muted text-[12px] font-[family-name:var(--font-body)]">
              Upload a Datalab JSON to get started
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {books.map((book: Doc<"books">) => (
              <BookCard key={book._id} book={book} />
            ))}
          </div>
        )}
      </div>

      {showUpload && <BookUpload onClose={() => setShowUpload(false)} />}
    </div>
  );
}
