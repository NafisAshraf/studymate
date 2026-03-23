"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { StreamingIndicator } from "./StreamingIndicator";
import { CitationSidebar } from "./CitationSidebar";
import { Sparkles } from "lucide-react";

export interface Citation {
  index: number;
  chunkId: string;
  sectionId?: string;
  bookTitle: string;
  sectionPath: string;
  excerpt: string;
  page: number;
}

export function ChatView() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const [sessionId, setSessionId] = useState<Id<"chatSessions"> | null>(
    sessionParam as Id<"chatSessions"> | null
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [activeCitations, setActiveCitations] = useState<Citation[] | null>(
    null
  );
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tokenBufferRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messages = useQuery(
    api.messages.bySession,
    sessionId ? { sessionId } : "skip"
  );
  const session = useQuery(
    api.chatSessions.get,
    sessionId ? { id: sessionId } : "skip"
  );
  const createSession = useMutation(api.chatSessions.create);

  useEffect(() => {
    setSessionId(
      sessionParam ? (sessionParam as Id<"chatSessions">) : null
    );
    setStreamedContent("");
    setStreamError(null);
    setCitations([]);
    setImageMap({});
    setActiveCitations(null);
    setHighlightedIndex(null);
  }, [sessionParam]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedContent]);

  const handleSend = useCallback(
    async (content: string) => {
      let currentSessionId = sessionId;

      if (!currentSessionId) {
        currentSessionId = await createSession();
        setSessionId(currentSessionId);
        window.history.replaceState(null, "", `/?session=${currentSessionId}`);
      }

      setIsStreaming(true);
      setStreamedContent("");
      setStreamStatus("hyde");
      setStreamError(null);
      setCitations([]);
      setImageMap({});

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: currentSessionId, query: content }),
        });

        if (!response.ok) throw new Error("Chat request failed");

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error("No response stream");

        // Start token buffer flush interval for smooth streaming
        flushTimerRef.current = setInterval(() => {
          if (tokenBufferRef.current) {
            setStreamedContent((prev) => prev + tokenBufferRef.current);
            tokenBufferRef.current = "";
          }
        }, 80);

        let buffer = "";
        let currentEventType = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim();
              continue;
            }
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);

                if (currentEventType === "error") {
                  setStreamError(
                    parsed.message || "An unexpected error occurred"
                  );
                  setStreamStatus(null);
                } else if (currentEventType === "status") {
                  setStreamStatus(parsed.step);
                } else if (currentEventType === "chunk") {
                  tokenBufferRef.current += parsed.text;
                  setStreamStatus("generating");
                } else if (currentEventType === "images") {
                  setImageMap(parsed.imageMap as Record<string, string>);
                } else if (currentEventType === "citations") {
                  setCitations(parsed.citations);
                } else if (currentEventType === "done") {
                  // Stream complete
                }
              } catch {
                // non-JSON data line
              }
              currentEventType = "";
            }
          }
        }
      } catch (error) {
        console.error("Chat error:", error);
        setStreamError(
          error instanceof Error ? error.message : "Connection failed"
        );
      } finally {
        // Flush any remaining buffered tokens
        if (tokenBufferRef.current) {
          setStreamedContent((prev) => prev + tokenBufferRef.current);
          tokenBufferRef.current = "";
        }
        if (flushTimerRef.current) {
          clearInterval(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        setIsStreaming(false);
        setStreamStatus(null);
      }
    },
    [sessionId, createSession]
  );

  const handleCitationClick = useCallback(
    (index: number, messageCitations: Citation[]) => {
      setActiveCitations(messageCitations);
      setHighlightedIndex(index);
    },
    []
  );

  const handleCitationHover = useCallback(
    (index: number | null, messageCitations: Citation[]) => {
      // Only scroll to highlight if sidebar is already open
      if (activeCitations) {
        setHighlightedIndex(index);
        // Update citations to the hovered message's citations if different
        if (index !== null) {
          setActiveCitations(messageCitations);
        }
      }
    },
    [activeCitations]
  );

  const showEmptyState =
    !sessionId || (!messages?.length && !isStreaming && !streamError);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {showEmptyState ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 relative overflow-hidden">
            <div className="absolute w-[260px] h-[260px] bg-[radial-gradient(circle,rgba(14,162,114,0.03)_0%,transparent_55%)] -top-[60px] -right-[40px]" />
            <div className="absolute w-[180px] h-[180px] bg-[radial-gradient(circle,rgba(46,196,138,0.02)_0%,transparent_55%)] -bottom-[30px] -left-[20px]" />

            <div className="flex items-center gap-1.5 relative">
              <div className="w-2 h-2 bg-accent rounded-full opacity-60 animate-bounce [animation-delay:0ms] [animation-duration:1.4s]" />
              <div className="w-1.5 h-1.5 bg-accent-secondary rounded-full opacity-40 animate-bounce [animation-delay:200ms] [animation-duration:1.4s]" />
              <div className="w-1 h-1 bg-accent rounded-full opacity-30 animate-bounce [animation-delay:400ms] [animation-duration:1.4s]" />
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-[24px] text-text-primary italic relative">
              Ready to dive in?
            </h1>
            <p className="font-[family-name:var(--font-body)] text-text-muted text-[12px] relative">
              Answers sourced from{" "}
              <span className="text-accent-secondary">your books</span>
            </p>
            <div className="mt-4 w-[90%] md:w-[65%] max-w-[600px] px-4 md:px-0">
              <ChatInput onSend={handleSend} disabled={isStreaming} />
            </div>
          </div>
        ) : (
          <>
            {session?.title && (
              <div className="px-3 md:px-6 pt-4 pb-2">
                <div className="max-w-3xl mx-auto">
                  <h2 className="font-[family-name:var(--font-display)] text-text-secondary text-[15px] italic truncate">
                    {session.title}
                  </h2>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 pt-4 md:pt-4">
              <div className="max-w-3xl mx-auto space-y-4">
                {messages?.map((msg: Doc<"messages">) => (
                  <ChatMessage
                    key={msg._id}
                    role={msg.role}
                    content={msg.content}
                    citationChunkIds={msg.citationChunkIds}
                    onCitationClick={handleCitationClick}
                    onCitationHover={handleCitationHover}
                  />
                ))}
                {isStreaming && (
                  <>
                    {streamStatus && streamStatus !== "generating" && (
                      <StreamingIndicator currentStep={streamStatus} />
                    )}
                    {streamedContent && (
                      <ChatMessage
                        role="assistant"
                        content={streamedContent}
                        isStreaming
                        streamCitations={citations}
                        streamImageMap={imageMap}
                        onCitationClick={handleCitationClick}
                        onCitationHover={handleCitationHover}
                      />
                    )}
                  </>
                )}
                {streamError && (
                  <div className="flex justify-start">
                    <div className="bg-red-950/40 border border-red-800/50 text-red-300 py-2.5 px-4 rounded-[12px] max-w-[70%] text-[13px] font-[family-name:var(--font-body)]">
                      <span className="font-medium">Error:</span>{" "}
                      {streamError}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <div className="px-3 md:px-6 py-3 md:py-4 border-t border-border-subtle">
              <div className="max-w-3xl mx-auto">
                <ChatInput onSend={handleSend} disabled={isStreaming} />
              </div>
            </div>
          </>
        )}
      </div>

      {activeCitations && (
        <CitationSidebar
          citations={activeCitations}
          highlightedIndex={highlightedIndex}
          onClose={() => {
            setActiveCitations(null);
            setHighlightedIndex(null);
          }}
        />
      )}
    </div>
  );
}
