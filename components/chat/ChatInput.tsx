"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowRight } from "lucide-react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, []);

  return (
    <div className="flex items-end gap-2 bg-bg-surface border border-border rounded-xl px-4 py-3 focus-within:border-accent/30 transition-colors">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Ask a question..."
        disabled={disabled}
        rows={1}
        className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-[13px] font-[family-name:var(--font-body)] resize-none outline-none min-h-[20px] max-h-[200px]"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="shrink-0 bg-accent p-1.5 rounded-md flex items-center justify-center hover:brightness-110 transition-all disabled:opacity-30 disabled:hover:brightness-100 cursor-pointer"
      >
        <ArrowRight className="w-3 h-3 text-black" />
      </button>
    </div>
  );
}
