"use client";

import { Suspense } from "react";
import { ChatView } from "@/components/chat/ChatView";

export default function Home() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
