import { retryWithBackoff } from "./retry";
import type { AssembledSection } from "./types";

interface Message {
  role: string;
  content: string;
}

/**
 * Strip [N] bracket-number patterns from source text so the LLM doesn't
 * confuse footnote markers in the original book with our citation format.
 */
function stripBracketNumbers(text: string): string {
  return text.replace(/\[\d+\]/g, "");
}

export async function* streamAnswer(
  query: string,
  sections: AssembledSection[],
  conversationHistory: Message[],
  imageFilenames?: string[]
): AsyncGenerator<string> {
  const numSources = sections.length;

  const sourcesText = sections
    .map(
      (section, i) =>
        `Source [${i + 1}]: ${section.sectionPath}\n---\n${stripBracketNumbers(section.content)}\n---`
    )
    .join("\n\n");

  const imageRules = imageFilenames && imageFilenames.length > 0
    ? `\n- Sources may contain images marked as [IMAGE: "description" | file: FILENAME]. If an image is directly relevant to your answer, include it on its own line using EXACTLY this syntax: ![short label](img:FILENAME) — use a brief 1-5 word alt label (no long descriptions). The "img:" prefix is required. Example: ![tree diagram](img:abc123_img.jpg)\n- Only reference images that exist in the sources. Do not invent image references.`
    : "";

  const systemPrompt = `You are StudyMate, an expert educational assistant. Answer the student's question using ONLY the provided sources. Be thorough, clear, and educational.

Rules:
- Cite sources using ONLY [1] through [${numSources}] — these are the only valid citation numbers. Do NOT use any other numbers.
- Place citations at the end of the relevant sentence or claim.
- You may cite multiple sources for a single statement like [1][3].
- If the sources don't contain enough information to answer, say so clearly.
- Use proper mathematical notation with LaTeX when needed (wrap in $ for inline, $$ for display).
- Be concise but thorough. Structure your answer with clear paragraphs.
- NEVER invent citation numbers outside the range [1]-[${numSources}].${imageRules}

Sources:
${sourcesText}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: query },
  ];

  const response = await retryWithBackoff(
    async () => {
      const res = await fetch(
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
            stream: true,
            max_tokens: 2000,
          }),
        }
      );

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Answer generation failed: ${error}`);
      }

      return res;
    },
    { label: "Generator", maxRetries: 2 }
  );

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (trimmed.startsWith("data: ")) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  }
}
