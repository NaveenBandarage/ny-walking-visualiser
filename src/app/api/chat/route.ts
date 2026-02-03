import { NextRequest } from "next/server";
import { getAllWalksSimplified, isDatabaseReady } from "@/lib/db";
import {
  prepareWalkDataForChat,
  buildChatSystemPrompt,
  ChatMessage,
} from "@/lib/chat";
import { Walk } from "@/lib/types";
import { getEmbedding } from "@/lib/ollama-embeddings";
import { getOllamaModel, getOllamaUrl } from "@/lib/ollama-config";
import { QdrantPoint, searchQdrant } from "@/lib/qdrant";

function formatRetrievedWalks(points: QdrantPoint[]): string {
  if (points.length === 0) return "";

  return points
    .map((point) => {
      const payload = (point.payload || {}) as Record<string, unknown>;
      const name =
        typeof payload.name === "string" ? payload.name : "Walk";
      const date =
        typeof payload.date === "string"
          ? payload.date.split("T")[0]
          : "";
      const day = typeof payload.day === "string" ? payload.day : "";
      const timeOfDay =
        typeof payload.time_of_day === "string" ? payload.time_of_day : "";
      const area =
        typeof payload.area_name === "string" ? payload.area_name : "";
      const distance =
        typeof payload.distance_km === "number"
          ? Math.round(payload.distance_km * 100) / 100
          : undefined;
      const duration =
        typeof payload.duration_min === "number"
          ? Math.round(payload.duration_min)
          : undefined;
      const summary =
        typeof payload.summary === "string" ? payload.summary : "";
      const description =
        typeof payload.description === "string" ? payload.description : "";

      const metaParts = [date, day, timeOfDay, area].filter(Boolean);
      const metricParts = [
        typeof distance === "number" ? `${distance}km` : "",
        typeof duration === "number" ? `${duration}min` : "",
      ].filter(Boolean);

      let line = `- ${name}`;
      if (metaParts.length > 0) {
        line += ` (${metaParts.join(", ")})`;
      }
      if (metricParts.length > 0) {
        line += `: ${metricParts.join(", ")}`;
      }
      const notes = [summary, description].filter(Boolean).join(" ");
      if (notes) {
        line += ` — ${notes}`;
      }
      return line;
    })
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [] } = body as {
      message: string;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    if (!isDatabaseReady()) {
      return Response.json(
        {
          error: "Database not initialized. Run 'npm run preprocess' first.",
        },
        { status: 400 },
      );
    }

    // Get walks from database and transform to Walk type
    const dbWalks = getAllWalksSimplified();
    const walks: Walk[] = dbWalks.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description || undefined,
      summary: w.summary || undefined,
      neighborhood: w.neighborhood || undefined,
      borough: w.borough || undefined,
      areaName: w.area_name || undefined,
      date: new Date(w.date),
      distance: w.distance_km,
      duration: w.duration_minutes,
      elevationGain: w.elevation_gain || undefined,
      elevationLoss: w.elevation_loss || undefined,
      coordinates: [],
      points: [],
    }));

    // Prepare walk data summary for context
    const walkData = prepareWalkDataForChat(walks);
    let retrievedContext = "";
    try {
      const queryEmbedding = await getEmbedding(message);
      const retrieved = await searchQdrant(queryEmbedding, 6);
      retrievedContext = formatRetrievedWalks(retrieved);
    } catch (error) {
      console.warn("RAG retrieval failed:", error);
    }
    const systemPrompt = buildChatSystemPrompt(walkData, retrievedContext);

    // Build messages for Ollama
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    // Check if Ollama is available
    try {
      const healthCheck = await fetch(`${getOllamaUrl()}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (!healthCheck.ok) {
        return Response.json(
          { error: "Ollama is not available. Please ensure it is running." },
          { status: 503 },
        );
      }
    } catch {
      return Response.json(
        {
          error:
            "Cannot connect to Ollama. Please ensure it is running on localhost:11434",
        },
        { status: 503 },
      );
    }

    // Make streaming request to Ollama
    const ollamaResponse = await fetch(`${getOllamaUrl()}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOllamaModel(),
        messages,
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 500,
        },
      }),
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error("Ollama error:", errorText);
      return Response.json(
        { error: `Ollama error: ${ollamaResponse.status}` },
        { status: 500 },
      );
    }

    // Create a transform stream to extract just the content from Ollama's response
    const reader = ollamaResponse.body?.getReader();
    if (!reader) {
      return Response.json(
        { error: "Failed to get response stream" },
        { status: 500 },
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter((line) => line.trim());

            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                if (json.message?.content) {
                  controller.enqueue(encoder.encode(json.message.content));
                }
              } catch {
                // Skip non-JSON lines
              }
            }
          }
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
