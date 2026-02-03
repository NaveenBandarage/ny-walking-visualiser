#!/usr/bin/env tsx
/**
 * Qdrant Indexing Script
 *
 * Builds vector embeddings for walks and upserts them into Qdrant.
 *
 * Usage:
 *   npm run index:qdrant
 *   npm run index:qdrant -- --recreate
 */

import { getAllWalksSimplified, isDatabaseReady, WalkRow } from "../src/lib/db";
import { getEmbedding } from "../src/lib/ollama-embeddings";
import { getOllamaEmbedModel } from "../src/lib/ollama-config";

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "walks";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

const args = process.argv.slice(2);
const recreate = args.includes("--recreate") || args.includes("-r");

function getTimeOfDay(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

async function qdrantFetch(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  if (QDRANT_API_KEY) {
    headers.set("api-key", QDRANT_API_KEY);
  }
  return fetch(`${QDRANT_URL}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20000),
  });
}

async function collectionExists(): Promise<boolean> {
  const response = await qdrantFetch(`/collections/${QDRANT_COLLECTION}`, {
    method: "GET",
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Qdrant collections error: ${response.status} ${errorText}`,
    );
  }
  return true;
}

async function deleteCollection(): Promise<void> {
  const response = await qdrantFetch(`/collections/${QDRANT_COLLECTION}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Qdrant delete error: ${response.status} ${errorText}`,
    );
  }
}

async function createCollection(vectorSize: number): Promise<void> {
  const response = await qdrantFetch(`/collections/${QDRANT_COLLECTION}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Qdrant create error: ${response.status} ${errorText}`,
    );
  }
}

async function upsertPoints(
  points: {
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }[],
): Promise<void> {
  const response = await qdrantFetch(
    `/collections/${QDRANT_COLLECTION}/points?wait=true`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Qdrant upsert error: ${response.status} ${errorText}`,
    );
  }
}

function buildWalkDocument(row: WalkRow) {
  const date = new Date(row.date);
  const day = date.toLocaleDateString("en-US", { weekday: "long" });
  const timeOfDay = getTimeOfDay(date);
  const distanceKm = Math.round(row.distance_km * 100) / 100;
  const durationMin = Math.round(row.duration_minutes);
  const elevationGainM = row.elevation_gain
    ? Math.round(row.elevation_gain)
    : undefined;
  const elevationLossM = row.elevation_loss
    ? Math.round(row.elevation_loss)
    : undefined;
  const areaName = row.area_name || row.neighborhood || row.borough || undefined;
  const centerLat = (row.bounds_min_lat + row.bounds_max_lat) / 2;
  const centerLng = (row.bounds_min_lng + row.bounds_max_lng) / 2;

  const textParts = [
    `Walk: ${row.name}`,
    row.description ? `Description: ${row.description}` : "",
    row.summary ? `Summary: ${row.summary}` : "",
    areaName ? `Area: ${areaName}` : "",
    row.neighborhood ? `Neighborhood: ${row.neighborhood}` : "",
    row.borough ? `Borough: ${row.borough}` : "",
    `Date: ${date.toISOString().split("T")[0]} (${day}, ${timeOfDay})`,
    `Distance: ${distanceKm} km`,
    `Duration: ${durationMin} min`,
    elevationGainM ? `Elevation gain: ${elevationGainM} m` : "",
    elevationLossM ? `Elevation loss: ${elevationLossM} m` : "",
    `Center: ${centerLat.toFixed(5)}, ${centerLng.toFixed(5)}`,
  ].filter(Boolean);

  return {
    id: row.id,
    text: textParts.join("\n"),
    payload: {
      id: row.id,
      name: row.name,
      description: row.description,
      summary: row.summary,
      date: date.toISOString(),
      day,
      time_of_day: timeOfDay,
      distance_km: distanceKm,
      duration_min: durationMin,
      elevation_gain_m: elevationGainM,
      elevation_loss_m: elevationLossM,
      area_name: areaName,
      neighborhood: row.neighborhood,
      borough: row.borough,
      center: { lat: centerLat, lng: centerLng },
      bounds: {
        minLng: row.bounds_min_lng,
        maxLng: row.bounds_max_lng,
        minLat: row.bounds_min_lat,
        maxLat: row.bounds_max_lat,
      },
    },
  };
}

async function main() {
  if (!isDatabaseReady()) {
    console.error("Database not ready. Run `npm run preprocess` first.");
    process.exit(1);
  }

  const rows = getAllWalksSimplified();
  if (rows.length === 0) {
    console.error("No walks found to index.");
    process.exit(1);
  }

  const documents = rows.map(buildWalkDocument);
  const embedModel = getOllamaEmbedModel();

  console.log(`Indexing ${documents.length} walks...`);
  console.log(`Ollama embed model: ${embedModel}`);
  console.log(`Qdrant: ${QDRANT_URL} / ${QDRANT_COLLECTION}`);

  const sampleEmbedding = await getEmbedding(documents[0].text);
  if (!Array.isArray(sampleEmbedding) || sampleEmbedding.length === 0) {
    throw new Error("Failed to generate embedding for collection sizing.");
  }

  if (recreate) {
    const exists = await collectionExists();
    if (exists) {
      console.log("Recreating collection...");
      await deleteCollection();
    }
    await createCollection(sampleEmbedding.length);
  } else if (!(await collectionExists())) {
    await createCollection(sampleEmbedding.length);
  }

  const batchSize = 16;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    const points = await Promise.all(
      batch.map(async (doc) => ({
        id: doc.id,
        vector: await getEmbedding(doc.text),
        payload: doc.payload,
      })),
    );
    await upsertPoints(points);
    const done = Math.min(i + batchSize, documents.length);
    console.log(`Indexed ${done}/${documents.length}`);
  }

  console.log("Qdrant indexing complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
