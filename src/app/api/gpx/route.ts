import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const gpxDir = path.join(process.cwd(), "public", "gpx");

    // Check if directory exists
    if (!fs.existsSync(gpxDir)) {
      return NextResponse.json({ files: [] });
    }

    // Read all GPX files
    const files = fs
      .readdirSync(gpxDir)
      .filter((file) => file.toLowerCase().endsWith(".gpx"));

    // Return URLs relative to public
    const urls = files.map((file) => `/gpx/${file}`);

    return NextResponse.json({ files: urls });
  } catch (error) {
    console.error("Error reading GPX directory:", error);
    return NextResponse.json({ files: [], error: "Failed to read GPX files" });
  }
}
