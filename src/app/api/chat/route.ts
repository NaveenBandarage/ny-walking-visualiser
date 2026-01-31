import { NextRequest } from "next/server";
import { getAllWalksSimplified } from "@/lib/db";
import {
  prepareWalkDataForChat,
  buildChatSystemPrompt,
  ChatMessage,
} from "@/lib/chat";
import { Walk } from "@/lib/types";

function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || "http://localhost:11434";
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || "gemma3:1b";
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

    // Get walks from database and transform to Walk type
    const dbWalks = getAllWalksSimplified();
    const walks: Walk[] = dbWalks.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description || undefined,
      summary: w.summary || undefined,
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
    const systemPrompt = buildChatSystemPrompt(walkData);

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
