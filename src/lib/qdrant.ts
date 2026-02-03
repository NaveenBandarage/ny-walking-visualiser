interface QdrantPoint {
  id: string | number;
  score?: number;
  payload?: Record<string, unknown>;
}

function getQdrantUrl(): string {
  return process.env.QDRANT_URL || "http://localhost:6333";
}

function getQdrantCollection(): string {
  return process.env.QDRANT_COLLECTION || "walks";
}

function getQdrantApiKey(): string | undefined {
  return process.env.QDRANT_API_KEY;
}

export function getQdrantConfig() {
  return {
    url: getQdrantUrl(),
    collection: getQdrantCollection(),
  };
}

async function qdrantFetch(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  const apiKey = getQdrantApiKey();
  if (apiKey) {
    headers.set("api-key", apiKey);
  }

  return fetch(`${getQdrantUrl()}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15000),
  });
}

export async function searchQdrant(
  vector: number[],
  limit = 6,
): Promise<QdrantPoint[]> {
  const collection = getQdrantCollection();
  const response = await qdrantFetch(
    `/collections/${collection}/points/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        with_vector: false,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Qdrant search error: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    result?: QdrantPoint[];
  };

  return Array.isArray(data.result) ? data.result : [];
}

export type { QdrantPoint };
