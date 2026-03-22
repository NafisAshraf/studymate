interface Message {
  role: string;
  content: string;
}

export async function generateHyDE(
  query: string,
  conversationHistory: Message[]
): Promise<string> {
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

  const data = await response.json();
  return data.choices[0].message.content;
}
