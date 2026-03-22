import { NextRequest, NextResponse } from "next/server";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/**
 * Fetch embeddings from OpenRouter with exponential backoff retry.
 * Handles 429 (rate limit) and 5xx (server errors) gracefully.
 */
async function fetchWithRetry(
  texts: string[],
  retries = MAX_RETRIES
): Promise<number[][]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen/qwen3-embedding-8b",
        input: texts,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.data.map(
        (item: { embedding: number[] }) => item.embedding
      );
    }

    const errorText = await response.text();

    // Retry on rate limit (429) or server errors (5xx)
    const isRetryable = response.status === 429 || response.status >= 500;
    if (isRetryable && attempt < retries) {
      // Check for Retry-After header
      const retryAfter = response.headers.get("retry-after");
      let delayMs: number;
      if (retryAfter) {
        delayMs = parseInt(retryAfter, 10) * 1000;
        if (isNaN(delayMs)) delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
      } else {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
      }
      console.warn(
        `Embedding API returned ${response.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    // Non-retryable error or exhausted retries
    throw new Error(
      `OpenRouter API error: ${response.status} ${errorText.slice(0, 500)}`
    );
  }

  throw new Error("Exhausted retries for embedding API");
}

export async function POST(req: NextRequest) {
  try {
    const { texts } = (await req.json()) as { texts: string[] };

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty 'texts' array" },
        { status: 400 }
      );
    }

    // Truncate overly long texts to avoid API issues (8k chars ~2k tokens)
    const MAX_TEXT_LENGTH = 8000;
    const truncatedTexts = texts.map((t) =>
      t.length > MAX_TEXT_LENGTH ? t.slice(0, MAX_TEXT_LENGTH) : t
    );

    const embeddings = await fetchWithRetry(truncatedTexts);
    return NextResponse.json({ embeddings });
  } catch (error) {
    console.error("Embedding error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate embeddings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
