import { NextResponse } from "next/server";
import {
  getAllWalksSimplified,
  getWalksInBounds,
  getStats,
  isDatabaseReady,
  WalkRow,
} from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Transform a database row to a Walk-like object for the frontend
 */
function transformWalk(row: WalkRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    date: row.date,
    distance: row.distance_km,
    duration: row.duration_minutes,
    elevationGain: row.elevation_gain,
    elevationLoss: row.elevation_loss,
    coordinates: JSON.parse(row.coordinates_simplified),
    color: row.color ? JSON.parse(row.color) : undefined,
    bounds: {
      minLng: row.bounds_min_lng,
      maxLng: row.bounds_max_lng,
      minLat: row.bounds_min_lat,
      maxLat: row.bounds_max_lat,
    },
  };
}

/**
 * GET /api/walks
 *
 * Returns all walks with simplified coordinates.
 * Optional query params:
 * - minLng, maxLng, minLat, maxLat: viewport bounds for filtering
 */
export async function GET(request: Request) {
  try {
    // Check if database is ready
    if (!isDatabaseReady()) {
      return NextResponse.json(
        {
          error: "Database not initialized. Run 'npm run preprocess' first.",
          walks: [],
          stats: { totalWalks: 0, totalDistance: 0, totalDuration: 0 },
        },
        { status: 200 },
      );
    }

    // Parse query params for viewport filtering
    const { searchParams } = new URL(request.url);
    const minLng = searchParams.get("minLng");
    const maxLng = searchParams.get("maxLng");
    const minLat = searchParams.get("minLat");
    const maxLat = searchParams.get("maxLat");

    let rows: WalkRow[];

    // If viewport bounds provided, filter by bounds
    if (minLng && maxLng && minLat && maxLat) {
      rows = getWalksInBounds(
        parseFloat(minLng),
        parseFloat(maxLng),
        parseFloat(minLat),
        parseFloat(maxLat),
      );
    } else {
      rows = getAllWalksSimplified();
    }

    const walks = rows.map(transformWalk);
    const stats = getStats();

    return NextResponse.json({
      walks,
      stats: {
        totalWalks: stats.totalWalks,
        totalDistance: stats.totalDistance,
        totalDuration: stats.totalDuration,
        averageDistance:
          stats.totalWalks > 0 ? stats.totalDistance / stats.totalWalks : 0,
        averageDuration:
          stats.totalWalks > 0 ? stats.totalDuration / stats.totalWalks : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching walks:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch walks",
        walks: [],
        stats: { totalWalks: 0, totalDistance: 0, totalDuration: 0 },
      },
      { status: 500 },
    );
  }
}
