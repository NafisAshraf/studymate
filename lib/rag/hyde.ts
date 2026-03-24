import { retryWithBackoff } from "./retry";
import type { StepMetrics } from "./types";

interface Message {
  role: string;
  content: string;
}

export async function generateHyDE(
  query: string,
  conversationHistory: Message[]
): Promise<{ text: string; metrics: StepMetrics }> {
  const recentHistory = conversationHistory.slice(-6);

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful educational assistant. Given a student's question and conversation context, write a hypothetical paragraph (100-200 words) that would answer this question as it would appear in an educational textbook. Write the answer directly without any preamble. Focus on being factually precise and educational.",
    },
    ...recentHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user",
      content: query,
    },
  ];

  const data = await retryWithBackoff(
    async () => {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages,
            max_tokens: 300,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HyDE generation failed: ${error}`);
      }

      return response.json();
    },
    { label: "HyDE" }
  );

  const usage = data.usage;
  const metrics: StepMetrics = {
    provider: "openrouter",
    model: typeof data.model === "string" ? data.model : undefined,
    inputTokens:
      typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
    outputTokens:
      typeof usage?.completion_tokens === "number"
        ? usage.completion_tokens
        : undefined,
    totalTokens:
      typeof usage?.total_tokens === "number" ? usage.total_tokens : undefined,
    cost: typeof usage?.cost === "number" ? usage.cost : undefined,
    costUnit: usage?.cost != null ? "credits" : undefined,
    providerRequestId: typeof data.id === "string" ? data.id : undefined,
    usageRaw: usage ? JSON.stringify(usage) : undefined,
  };

  return {
    text: data.choices[0].message.content,
    metrics,
  };
}
