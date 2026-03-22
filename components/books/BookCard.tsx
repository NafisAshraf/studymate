"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Pencil, Trash2, Check, X, MoreVertical } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "parsing":
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-[family-name:var(--font-body)] text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-spin" />
          Parsing
        </span>
      );
    case "embedding":
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-[family-name:var(--font-body)] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Embedding
        </span>
      );
    case "ready":
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-[family-name:var(--font-body)] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Ready
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-[family-name:var(--font-body)] text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Error
        </span>
      );
    default:
      return null;
  }
}

interface BookCardProps {
  book: Doc<"books">;
}

export function BookCard({ book }: BookCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(book.title);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const renameBook = useMutation(api.books.rename);
  const removeBook = useMutation(api.books.remove);

  const bookEmojis = ["📕", "📗", "📘"];
  const emoji = bookEmojis[Math.abs(book.title.length) % bookEmojis.length];

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  // Focus input when editing
  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const handleRename = async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== book.title) {
      await renameBook({ id: book._id, title: trimmed });
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await removeBook({ id: book._id });
    setShowDeleteConfirm(false);
  };

  return (
    <div className="group relative bg-bg-surface border border-border rounded-xl p-4 hover:border-accent/30 transition-all">
      {/* Menu button */}
      <div className="absolute top-3 right-3" ref={menuRef}>
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowMenu(!showMenu);
          }}
          className="p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-1 bg-bg-elevated border border-border rounded-lg py-1 shadow-xl z-10 min-w-[120px]">
            <button
              onClick={() => {
                setIsEditing(true);
                setEditTitle(book.title);
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-[family-name:var(--font-body)] text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
              Rename
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(true);
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-[family-name:var(--font-body)] text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        )}
      </div>

      <Link
        href={`/books/${book._id}`}
        className={`block ${isEditing || showDeleteConfirm ? "pointer-events-none" : ""}`}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">{emoji}</span>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div
                className="flex items-center gap-1.5"
                onClick={(e) => e.preventDefault()}
              >
                <input
                  ref={inputRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") setIsEditing(false);
                  }}
                  className="flex-1 bg-bg-primary border border-border rounded-md px-2 py-1 text-[13px] font-[family-name:var(--font-body)] text-text-primary outline-none focus:border-accent/50 pointer-events-auto min-w-0"
                />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleRename();
                  }}
                  className="p-1 text-accent hover:brightness-110 cursor-pointer pointer-events-auto"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setIsEditing(false);
                  }}
                  className="p-1 text-text-muted hover:text-text-secondary cursor-pointer pointer-events-auto"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <h3 className="font-[family-name:var(--font-body)] text-[14px] font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                {book.title}
              </h3>
            )}
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-text-muted text-[11px] font-[family-name:var(--font-body)]">
                {book.pageCount} pages
              </span>
              <span className="text-text-muted text-[11px] font-[family-name:var(--font-body)]">
                {book.chunkCount} chunks
              </span>
            </div>
            <div className="mt-2.5">
              <StatusBadge status={book.status} />
            </div>
          </div>
        </div>
      </Link>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-bg-surface/95 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 z-20 p-4">
          <p className="text-[13px] font-[family-name:var(--font-body)] text-text-primary text-center">
            Delete <span className="font-medium">{book.title}</span>?
          </p>
          <p className="text-[11px] font-[family-name:var(--font-body)] text-text-muted text-center">
            All sections, chunks and embeddings will be removed.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-[12px] font-[family-name:var(--font-body)] text-text-secondary bg-bg-hover rounded-md hover:brightness-110 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-[12px] font-[family-name:var(--font-body)] text-white bg-red-600 rounded-md hover:bg-red-500 transition-all cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
