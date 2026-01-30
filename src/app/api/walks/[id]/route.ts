import { NextResponse } from "next/server";
import { getWalkFull } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/walks/[id]
 *
 * Returns a single walk with full (non-simplified) coordinates.
 * Used when a walk is selected and needs full detail.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const row = getWalkFull(id);

    if (!row) {
      return NextResponse.json({ error: "Walk not found" }, { status: 404 });
    }

    // Return walk with full coordinates
    const walk = {
      id: row.id,
      name: row.name,
      description: row.description,
      date: row.date,
      distance: row.distance_km,
      duration: row.duration_minutes,
      elevationGain: row.elevation_gain,
      elevationLoss: row.elevation_loss,
      coordinates: JSON.parse(row.coordinates_full),
      coordinatesSimplified: JSON.parse(row.coordinates_simplified),
      points: JSON.parse(row.points),
      color: row.color ? JSON.parse(row.color) : undefined,
      bounds: {
        minLng: row.bounds_min_lng,
        maxLng: row.bounds_max_lng,
        minLat: row.bounds_min_lat,
        maxLat: row.bounds_max_lat,
      },
    };

    return NextResponse.json({ walk });
  } catch (error) {
    console.error("Error fetching walk:", error);
    return NextResponse.json(
      { error: "Failed to fetch walk" },
      { status: 500 },
    );
  }
}
