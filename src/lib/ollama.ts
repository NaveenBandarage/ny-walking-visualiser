/**
 * Ollama Integration for Route Summary Generation
 *
 * This module provides functions to generate AI summaries for walking routes
 * using a local Ollama instance.
 */

// Configuration getters - read at runtime to support dynamic loading
function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || "http://localhost:11434";
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || "gemma3:1b";
}

// Export for logging purposes
export function getOllamaConfig() {
  return { url: getOllamaUrl(), model: getOllamaModel() };
}

interface RouteData {
  name: string;
  distance: number; // in kilometers
  duration: number; // in minutes
  elevationGain?: number;
  elevationLoss?: number;
  date: Date;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

/**
 * Check if Ollama is available
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getOllamaUrl()}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate a concise summary for a walking route
 */
export async function generateRouteSummary(
  routeData: RouteData,
): Promise<string> {
  const { name, distance, duration, elevationGain, elevationLoss, date } =
    routeData;

  // Format the data for the prompt
  const distanceStr =
    distance < 1
      ? `${Math.round(distance * 1000)}m`
      : `${distance.toFixed(1)}km`;
  const hours = Math.floor(duration / 60);
  const mins = Math.round(duration % 60);
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Build elevation info if available
  let elevationInfo = "";
  if (elevationGain !== undefined && elevationGain > 0) {
    elevationInfo += `Elevation gain: ${Math.round(elevationGain)}m. `;
  }
  if (elevationLoss !== undefined && elevationLoss > 0) {
    elevationInfo += `Elevation loss: ${Math.round(elevationLoss)}m. `;
  }

  const prompt = `You are recalling a walk you took in New York City. Write a brief, personal reflection describing the experience of this walk. Your response should be no more than 50 words and written in past tense, as if you're telling a friend about it.

Focus on:
- The vibe and atmosphere of the neighborhood
- What made this walk memorable or notable
- Any NYC-specific details that stood out

Keep it conversational and authentic. Don't list statistics - weave them naturally into the narrative.

Walk data:
- Distance: ${distanceStr}
- Duration: ${durationStr}
- Time of day: ${dateStr}
${elevationInfo ? `- ${elevationInfo.trim()}` : ""}

Your reflection:`;

  try {
    const response = await fetch(`${getOllamaUrl()}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOllamaModel(),
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 100, // Allow up to ~50 words
        },
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data: OllamaResponse = await response.json();

    // Clean up the response
    let summary = data.response.trim();

    // Remove quotes if present
    summary = summary.replace(/^["']|["']$/g, "");

    // Ensure it ends with proper punctuation
    if (!/[.!?]$/.test(summary)) {
      summary += ".";
    }

    // Truncate if too long (safety measure - ~75 words max)
    if (summary.length > 400) {
      summary = summary.substring(0, 397) + "...";
    }

    return summary;
  } catch (error) {
    console.error("Error generating route summary:", error);
    throw error;
  }
}

/**
 * Generate summaries for multiple routes with progress callback
 */
export async function generateRouteSummaries(
  routes: RouteData[],
  onProgress?: (current: number, total: number, routeName: string) => void,
): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    if (onProgress) {
      onProgress(i + 1, routes.length, route.name);
    }

    try {
      const summary = await generateRouteSummary(route);
      summaries.set(route.name, summary);
    } catch (error) {
      console.error(`Failed to generate summary for ${route.name}:`, error);
      // Continue with other routes even if one fails
    }
  }

  return summaries;
}
