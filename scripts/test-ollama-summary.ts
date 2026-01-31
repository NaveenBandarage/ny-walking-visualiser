#!/usr/bin/env tsx
/**
 * Ollama Summary Test Script
 *
 * Tests route summary generation with different Ollama models.
 * Tracks time taken and outputs the summary for comparison.
 *
 * Usage:
 *   npx tsx scripts/test-ollama-summary.ts [model]
 *
 * Examples:
 *   npx tsx scripts/test-ollama-summary.ts                    # Uses default model
 *   npx tsx scripts/test-ollama-summary.ts qwen2.5:1.5b       # Uses qwen2.5:1.5b
 *   npx tsx scripts/test-ollama-summary.ts gemma3:4b          # Uses gemma3:4b
 *   npx tsx scripts/test-ollama-summary.ts llama3:latest      # Uses llama3
 */

import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:1.5b";
const GPX_DIR = path.join(process.cwd(), "public", "gpx");

interface RouteData {
  name: string;
  distance: number;
  duration: number;
  elevationGain?: number;
  elevationLoss?: number;
  date: Date;
}

interface TestResult {
  model: string;
  routeName: string;
  summary: string;
  timeMs: number;
  tokensPerSecond?: number;
}

/**
 * Check if Ollama is available
 */
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List available models
 */
async function listModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await response.json();
    return data.models?.map((m: { name: string }) => m.name) || [];
  } catch {
    return [];
  }
}

/**
 * Generate summary with timing
 */
async function generateSummaryWithTiming(
  routeData: RouteData,
  model: string,
): Promise<TestResult> {
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

  const startTime = performance.now();

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 100, // ~50 words
      },
    }),
    signal: AbortSignal.timeout(60000),
  });

  const endTime = performance.now();
  const timeMs = endTime - startTime;

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status}`);
  }

  const data = await response.json();
  let summary = data.response?.trim() || "";
  summary = summary.replace(/^["']|["']$/g, "");
  if (!/[.!?]$/.test(summary)) {
    summary += ".";
  }

  // Calculate tokens per second if available
  const evalCount = data.eval_count;
  const evalDuration = data.eval_duration;
  const tokensPerSecond =
    evalCount && evalDuration ? (evalCount / evalDuration) * 1e9 : undefined;

  return {
    model,
    routeName: name,
    summary,
    timeMs,
    tokensPerSecond,
  };
}

/**
 * Parse a GPX file and extract route data
 */
function parseGPXFile(filePath: string): RouteData | null {
  try {
    const gpxString = fs.readFileSync(filePath, "utf-8");
    const parser = new DOMParser();
    const gpxDoc = parser.parseFromString(gpxString, "application/xml");

    // Extract name
    const nameElements = gpxDoc.getElementsByTagName("name");
    const name =
      nameElements.length > 0
        ? nameElements[0].textContent || path.basename(filePath)
        : path.basename(filePath);

    // Extract track points
    const trackPoints = gpxDoc.getElementsByTagName("trkpt");
    const routePoints = gpxDoc.getElementsByTagName("rtept");
    const allPoints = [...Array.from(trackPoints), ...Array.from(routePoints)];

    if (allPoints.length < 2) {
      return null;
    }

    // Calculate distance
    let totalDistance = 0;
    for (let i = 1; i < allPoints.length; i++) {
      const lat1 = parseFloat(allPoints[i - 1].getAttribute("lat") || "0");
      const lon1 = parseFloat(allPoints[i - 1].getAttribute("lon") || "0");
      const lat2 = parseFloat(allPoints[i].getAttribute("lat") || "0");
      const lon2 = parseFloat(allPoints[i].getAttribute("lon") || "0");
      totalDistance += haversineDistance(lat1, lon1, lat2, lon2);
    }

    // Calculate duration and elevation
    let duration = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    let firstTime: Date | null = null;
    let lastTime: Date | null = null;
    let prevElevation: number | null = null;

    for (const pt of allPoints) {
      const timeElements = pt.getElementsByTagName("time");
      if (timeElements.length > 0 && timeElements[0].textContent) {
        const time = new Date(timeElements[0].textContent);
        if (!firstTime) firstTime = time;
        lastTime = time;
      }

      const eleElements = pt.getElementsByTagName("ele");
      if (eleElements.length > 0 && eleElements[0].textContent) {
        const elevation = parseFloat(eleElements[0].textContent);
        if (prevElevation !== null) {
          const diff = elevation - prevElevation;
          if (diff > 0) elevationGain += diff;
          else elevationLoss += Math.abs(diff);
        }
        prevElevation = elevation;
      }
    }

    if (firstTime && lastTime) {
      duration = (lastTime.getTime() - firstTime.getTime()) / (1000 * 60);
    } else {
      // Estimate: 5 km/h walking speed
      duration = (totalDistance / 5) * 60;
    }

    // Extract date
    const timeElements = gpxDoc.getElementsByTagName("time");
    const timeStr =
      timeElements.length > 0 ? timeElements[0].textContent : null;
    const date = timeStr ? new Date(timeStr) : new Date();

    return {
      name,
      distance: totalDistance,
      duration,
      elevationGain: elevationGain > 0 ? elevationGain : undefined,
      elevationLoss: elevationLoss > 0 ? elevationLoss : undefined,
      date,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const model = args[0] || DEFAULT_MODEL;

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           Ollama Route Summary Test Script                 ║");
  console.log(
    "╚════════════════════════════════════════════════════════════╝\n",
  );

  // Check Ollama availability
  console.log("Checking Ollama availability...");
  if (!(await isOllamaAvailable())) {
    console.error("❌ Ollama is not running. Start it with: ollama serve");
    process.exit(1);
  }
  console.log("✅ Ollama is available\n");

  // List available models
  const availableModels = await listModels();
  console.log("Available models:");
  availableModels.forEach((m) => {
    const indicator = m === model ? " ← selected" : "";
    console.log(`   • ${m}${indicator}`);
  });
  console.log();

  // Check if selected model is available
  if (!availableModels.includes(model)) {
    console.error(`❌ Model "${model}" is not available.`);
    console.log(`   Pull it with: ollama pull ${model}`);
    process.exit(1);
  }

  // Find a GPX file to test with
  const gpxFiles = fs
    .readdirSync(GPX_DIR)
    .filter((f) => f.toLowerCase().endsWith(".gpx"))
    .slice(0, 3); // Test with first 3 files

  if (gpxFiles.length === 0) {
    console.error("❌ No GPX files found in public/gpx/");
    process.exit(1);
  }

  console.log(`Testing with model: ${model}`);
  console.log(`Testing ${gpxFiles.length} route(s)...\n`);
  console.log("─".repeat(70));

  const results: TestResult[] = [];

  for (const gpxFile of gpxFiles) {
    const filePath = path.join(GPX_DIR, gpxFile);
    const routeData = parseGPXFile(filePath);

    if (!routeData) {
      console.log(`⚠️  Skipping ${gpxFile} - could not parse`);
      continue;
    }

    console.log(`\n📍 Route: ${routeData.name}`);
    console.log(`   Distance: ${routeData.distance.toFixed(2)} km`);
    console.log(`   Duration: ${Math.round(routeData.duration)} min`);
    if (routeData.elevationGain) {
      console.log(
        `   Elevation: +${Math.round(routeData.elevationGain)}m / -${Math.round(routeData.elevationLoss || 0)}m`,
      );
    }
    console.log();

    try {
      console.log("   Generating summary...");
      const result = await generateSummaryWithTiming(routeData, model);
      results.push(result);

      console.log(`   ⏱️  Time: ${formatDuration(result.timeMs)}`);
      if (result.tokensPerSecond) {
        console.log(
          `   🚀 Speed: ${result.tokensPerSecond.toFixed(1)} tokens/sec`,
        );
      }
      console.log();
      console.log("   📝 Summary:");
      console.log("   ┌" + "─".repeat(66) + "┐");
      // Word wrap the summary
      const words = result.summary.split(" ");
      let line = "";
      for (const word of words) {
        if ((line + " " + word).length > 64) {
          console.log(`   │ ${line.padEnd(64)} │`);
          line = word;
        } else {
          line = line ? line + " " + word : word;
        }
      }
      if (line) {
        console.log(`   │ ${line.padEnd(64)} │`);
      }
      console.log("   └" + "─".repeat(66) + "┘");
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
    }
  }

  // Summary statistics
  if (results.length > 0) {
    console.log("\n" + "─".repeat(70));
    console.log("\n📊 Summary Statistics:");
    const avgTime =
      results.reduce((sum, r) => sum + r.timeMs, 0) / results.length;
    const avgSpeed =
      results.filter((r) => r.tokensPerSecond).length > 0
        ? results
            .filter((r) => r.tokensPerSecond)
            .reduce((sum, r) => sum + (r.tokensPerSecond || 0), 0) /
          results.filter((r) => r.tokensPerSecond).length
        : null;

    console.log(`   Model: ${model}`);
    console.log(`   Routes tested: ${results.length}`);
    console.log(`   Average time: ${formatDuration(avgTime)}`);
    if (avgSpeed) {
      console.log(`   Average speed: ${avgSpeed.toFixed(1)} tokens/sec`);
    }
  }

  console.log("\n✨ Test complete!\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
