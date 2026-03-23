import { retryWithBackoff } from "./retry";

export async function embedText(text: string): Promise<number[]> {
  const data = await retryWithBackoff(
    async () => {
      const response = await fetch(
        "https://openrouter.ai/api/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen/qwen3-embedding-8b",
            input: [text],
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding failed: ${error}`);
      }

      return response.json();
    },
    { label: "Embedding" }
  );

  return data.data[0].embedding;
}
