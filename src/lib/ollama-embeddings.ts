import { getOllamaEmbedModel, getOllamaUrl } from "./ollama-config";

export async function getEmbedding(text: string): Promise<number[]> {
  const url = `${getOllamaUrl()}/api/embeddings`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getOllamaEmbedModel(),
      prompt: text,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Ollama embeddings error: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    embedding?: number[];
    embeddings?: number[][];
  };

  if (Array.isArray(data.embedding)) {
    return data.embedding;
  }

  if (Array.isArray(data.embeddings) && data.embeddings[0]) {
    return data.embeddings[0];
  }

  throw new Error("Ollama embeddings response missing embedding vector");
}
