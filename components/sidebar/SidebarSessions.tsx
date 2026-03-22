"use client";

import { MessageSquare, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

export function SidebarSessions() {
  const sessions = useQuery(api.chatSessions.list);
  const removeSession = useMutation(api.chatSessions.remove);
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentSessionId = searchParams.get("session");

  if (!sessions || sessions.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border-subtle pt-3">
      <div className="font-[family-name:var(--font-body)] text-text-secondary/60 text-[9px] uppercase tracking-[1.5px] mb-2">
        Recent
      </div>
      <div className="flex flex-col gap-0.5">
        {sessions.map((session: Doc<"chatSessions">) => (
          <div key={session._id} className="group relative flex items-center">
            <Link
              href={`/?session=${session._id}`}
              className={`flex-1 flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-[11px] font-[family-name:var(--font-body)] transition-colors truncate ${
                currentSessionId === session._id
                  ? "text-accent-secondary bg-accent-muted"
                  : "text-text-secondary hover:bg-bg-hover"
              }`}
            >
              <MessageSquare className="w-2.5 h-2.5 opacity-40 shrink-0" />
              <span className="truncate">
                {session.title || "New conversation"}
              </span>
            </Link>
            <button
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (currentSessionId === session._id) {
                  router.push("/");
                }
                await removeSession({ id: session._id });
              }}
              className="absolute right-1 p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
