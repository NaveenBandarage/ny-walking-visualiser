import { gpx } from "@tmcw/togeojson";
import { Walk, WalkPoint } from "./types";
import {
  calculatePathDistance,
  calculateDuration,
  calculateElevation,
  generateId,
  getWalkColor,
} from "./utils";

/**
 * Parse a GPX string into a Walk object
 */
export function parseGPX(gpxString: string, index: number = 0): Walk | null {
  try {
    const parser = new DOMParser();
    const gpxDoc = parser.parseFromString(gpxString, "application/xml");

    // Check for parsing errors
    const parseError = gpxDoc.querySelector("parsererror");
    if (parseError) {
      console.error("GPX parsing error:", parseError.textContent);
      return null;
    }

    const geoJSON = gpx(gpxDoc);

    if (!geoJSON.features || geoJSON.features.length === 0) {
      console.error("No features found in GPX");
      return null;
    }

    // Get the first track/route feature
    const feature = geoJSON.features.find(
      (f) =>
        f.geometry.type === "LineString" ||
        f.geometry.type === "MultiLineString",
    );

    if (!feature) {
      console.error("No track or route found in GPX");
      return null;
    }

    // Extract coordinates
    let coordinates: [number, number][];
    if (feature.geometry.type === "LineString") {
      coordinates = feature.geometry.coordinates.map(
        (coord: number[]) => [coord[0], coord[1]] as [number, number],
      );
    } else if (feature.geometry.type === "MultiLineString") {
      // Flatten multi-line strings
      coordinates = feature.geometry.coordinates.flatMap((line: number[][]) =>
        line.map((coord) => [coord[0], coord[1]] as [number, number]),
      );
    } else {
      return null;
    }

    // Extract track points with metadata from original GPX
    const points = extractTrackPoints(gpxDoc);

    // Extract metadata
    const name =
      (feature.properties?.name as string) ||
      gpxDoc.querySelector("metadata > name")?.textContent ||
      gpxDoc.querySelector("trk > name")?.textContent ||
      `Walk ${index + 1}`;

    const description =
      (feature.properties?.desc as string) ||
      gpxDoc.querySelector("metadata > desc")?.textContent ||
      gpxDoc.querySelector("trk > desc")?.textContent;

    // Extract date
    const timeStr =
      (feature.properties?.time as string) ||
      gpxDoc.querySelector("metadata > time")?.textContent ||
      gpxDoc.querySelector("trk > time")?.textContent ||
      gpxDoc.querySelector("trkpt > time")?.textContent;

    const date = timeStr ? new Date(timeStr) : new Date();

    // Calculate metrics
    const distance = calculatePathDistance(points);
    const duration = calculateDuration(points);
    const { gain, loss } = calculateElevation(points);

    return {
      id: generateId(),
      name,
      description,
      date,
      coordinates,
      points,
      distance,
      duration: duration > 0 ? duration : estimateDuration(distance),
      elevationGain: gain,
      elevationLoss: loss,
      color: getWalkColor(index),
    };
  } catch (error) {
    console.error("Error parsing GPX:", error);
    return null;
  }
}

/**
 * Extract track points with full metadata from GPX document
 */
function extractTrackPoints(gpxDoc: Document): WalkPoint[] {
  const points: WalkPoint[] = [];
  const trackPoints = gpxDoc.querySelectorAll("trkpt, rtept");

  trackPoints.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute("lat") || "0");
    const lon = parseFloat(pt.getAttribute("lon") || "0");
    const ele = pt.querySelector("ele")?.textContent;
    const time = pt.querySelector("time")?.textContent;

    points.push({
      latitude: lat,
      longitude: lon,
      elevation: ele ? parseFloat(ele) : undefined,
      time: time ? new Date(time) : undefined,
    });
  });

  return points;
}

/**
 * Estimate duration based on distance (assuming average walking speed of 5 km/h)
 */
function estimateDuration(distanceKm: number): number {
  const avgSpeedKmH = 5;
  return (distanceKm / avgSpeedKmH) * 60; // Return minutes
}

/**
 * Parse multiple GPX files
 */
export async function parseGPXFiles(files: File[]): Promise<Walk[]> {
  const walks: Walk[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const text = await file.text();
    const walk = parseGPX(text, i);
    if (walk) {
      walks.push(walk);
    }
  }

  return walks;
}

/**
 * Fetch and parse GPX files from URLs
 */
export async function fetchAndParseGPX(urls: string[]): Promise<Walk[]> {
  const walks: Walk[] = [];

  for (let i = 0; i < urls.length; i++) {
    try {
      const response = await fetch(urls[i]);
      const text = await response.text();
      const walk = parseGPX(text, i);
      if (walk) {
        walks.push(walk);
      }
    } catch (error) {
      console.error(`Error fetching GPX from ${urls[i]}:`, error);
    }
  }

  return walks;
}

/**
 * Load GPX files from the public directory
 * This function should be called from a Server Component or API route
 */
export async function loadGPXFromPublic(): Promise<string[]> {
  // This will be implemented as an API route
  // Returns array of GPX file URLs
  return [];
}
