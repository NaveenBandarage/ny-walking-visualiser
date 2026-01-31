#!/usr/bin/env tsx
/**
 * GPX Preprocessing Script
 *
 * This script reads all GPX files from public/gpx/, parses them,
 * simplifies the coordinates, generates AI summaries, and stores them in SQLite database.
 *
 * Usage: npm run preprocess
 */

import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";
import { gpx } from "@tmcw/togeojson";
import {
  insertWalk,
  clearWalks,
  closeDb,
  getWalkCount,
  getProcessedSourceFiles,
  getWalksWithoutSummary,
  updateWalkSummary,
  getWalkBySourceFile,
} from "../src/lib/db";
import { simplifyPath, getSimplificationRatio } from "../src/lib/simplify";
import {
  isOllamaAvailable,
  generateRouteSummary,
  getOllamaConfig,
} from "../src/lib/ollama";

// Parse command line arguments
const args = process.argv.slice(2);
const forceRebuild = args.includes("--force") || args.includes("-f");
const statusOnly = args.includes("--status") || args.includes("-s");
const summariesOnly =
  args.includes("--summaries") || args.includes("--generate-summaries");

// Types
interface WalkPoint {
  longitude: number;
  latitude: number;
  elevation?: number;
  time?: Date;
}

// Configuration
const GPX_DIR = path.join(process.cwd(), "public", "gpx");
const TARGET_SIMPLIFIED_POINTS = 50;

/**
 * Calculate the distance between two coordinates using the Haversine formula
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate the total distance of a path from an array of points
 */
function calculatePathDistance(points: WalkPoint[]): number {
  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += haversineDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude,
    );
  }
  return totalDistance;
}

/**
 * Calculate duration from timestamps in points
 */
function calculateDuration(points: WalkPoint[]): number {
  if (points.length < 2) return 0;

  const firstPoint = points.find((p) => p.time);
  const lastPoint = [...points].reverse().find((p) => p.time);

  if (!firstPoint?.time || !lastPoint?.time) return 0;

  const startTime = new Date(firstPoint.time).getTime();
  const endTime = new Date(lastPoint.time).getTime();

  return (endTime - startTime) / (1000 * 60); // Return minutes
}

/**
 * Calculate elevation gain and loss
 */
function calculateElevation(points: WalkPoint[]): {
  gain: number;
  loss: number;
} {
  let gain = 0;
  let loss = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].elevation;
    const curr = points[i].elevation;

    if (prev !== undefined && curr !== undefined) {
      const diff = curr - prev;
      if (diff > 0) {
        gain += diff;
      } else {
        loss += Math.abs(diff);
      }
    }
  }

  return { gain, loss };
}

/**
 * Estimate duration based on distance (assuming average walking speed of 5 km/h)
 */
function estimateDuration(distanceKm: number): number {
  const avgSpeedKmH = 5;
  return (distanceKm / avgSpeedKmH) * 60; // Return minutes
}

/**
 * Get a color for a walk based on its index
 */
function getWalkColor(index: number): [number, number, number, number] {
  const alpha = 180;
  const colors: [number, number, number, number][] = [
    [255, 255, 255, alpha],
    [200, 200, 255, alpha],
    [255, 200, 200, alpha],
    [200, 255, 200, alpha],
    [255, 255, 200, alpha],
    [200, 255, 255, alpha],
    [255, 200, 255, alpha],
  ];
  return colors[index % colors.length];
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Extract track points with full metadata from GPX document
 */
function extractTrackPoints(gpxDoc: Document): WalkPoint[] {
  const points: WalkPoint[] = [];
  const trackPoints = gpxDoc.getElementsByTagName("trkpt");
  const routePoints = gpxDoc.getElementsByTagName("rtept");

  const allPoints = [...Array.from(trackPoints), ...Array.from(routePoints)];

  for (const pt of allPoints) {
    const lat = parseFloat(pt.getAttribute("lat") || "0");
    const lon = parseFloat(pt.getAttribute("lon") || "0");

    const eleElements = pt.getElementsByTagName("ele");
    const timeElements = pt.getElementsByTagName("time");

    const ele = eleElements.length > 0 ? eleElements[0].textContent : null;
    const time = timeElements.length > 0 ? timeElements[0].textContent : null;

    points.push({
      latitude: lat,
      longitude: lon,
      elevation: ele ? parseFloat(ele) : undefined,
      time: time ? new Date(time) : undefined,
    });
  }

  return points;
}

/**
 * Parse a GPX file and return walk data
 */
function parseGPXFile(filePath: string, index: number) {
  const gpxString = fs.readFileSync(filePath, "utf-8");
  const parser = new DOMParser();
  const gpxDoc = parser.parseFromString(gpxString, "application/xml");

  // Check for parsing errors
  const parseErrors = gpxDoc.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) {
    console.error(`GPX parsing error in ${filePath}`);
    return null;
  }

  // Convert to GeoJSON
  const geoJSON = gpx(gpxDoc);

  if (!geoJSON.features || geoJSON.features.length === 0) {
    console.error(`No features found in ${filePath}`);
    return null;
  }

  // Get the first track/route feature
  const feature = geoJSON.features.find(
    (f) =>
      f.geometry.type === "LineString" || f.geometry.type === "MultiLineString",
  );

  if (!feature) {
    console.error(`No track or route found in ${filePath}`);
    return null;
  }

  // Extract coordinates
  let coordinates: [number, number][];
  if (feature.geometry.type === "LineString") {
    coordinates = (feature.geometry.coordinates as number[][]).map(
      (coord) => [coord[0], coord[1]] as [number, number],
    );
  } else if (feature.geometry.type === "MultiLineString") {
    coordinates = (feature.geometry.coordinates as number[][][]).flatMap(
      (line) => line.map((coord) => [coord[0], coord[1]] as [number, number]),
    );
  } else {
    return null;
  }

  // Extract track points with metadata from original GPX
  const points = extractTrackPoints(gpxDoc);

  // Extract metadata
  const nameElements = gpxDoc.getElementsByTagName("name");
  const name =
    nameElements.length > 0
      ? nameElements[0].textContent || `Walk ${index + 1}`
      : `Walk ${index + 1}`;

  const descElements = gpxDoc.getElementsByTagName("desc");
  const description =
    descElements.length > 0
      ? descElements[0].textContent || undefined
      : undefined;

  // Extract date
  const timeElements = gpxDoc.getElementsByTagName("time");
  const timeStr = timeElements.length > 0 ? timeElements[0].textContent : null;
  const date = timeStr ? new Date(timeStr) : new Date();

  // Calculate metrics
  const distance = calculatePathDistance(points);
  const duration = calculateDuration(points);
  const { gain, loss } = calculateElevation(points);

  // Simplify coordinates
  const coordinatesSimplified = simplifyPath(coordinates, 0.0001);

  return {
    id: generateId(),
    name,
    description,
    date,
    coordinatesFull: coordinates,
    coordinatesSimplified,
    points,
    distance,
    duration: duration > 0 ? duration : estimateDuration(distance),
    elevationGain: gain,
    elevationLoss: loss,
    color: getWalkColor(index),
    sourceFile: path.basename(filePath),
  };
}

/**
 * Show processing status
 */
function showStatus(gpxFiles: string[], processedFiles: string[]) {
  const gpxFileNames = gpxFiles.map((f) => path.basename(f));
  const processedSet = new Set(processedFiles);

  const unprocessed = gpxFileNames.filter((f) => !processedSet.has(f));
  const processed = gpxFileNames.filter((f) => processedSet.has(f));

  // Check for orphaned entries (in DB but file no longer exists)
  const gpxSet = new Set(gpxFileNames);
  const orphaned = processedFiles.filter((f) => !gpxSet.has(f));

  console.log("📊 Processing Status");
  console.log("====================\n");

  console.log(`   Total GPX files:     ${gpxFileNames.length}`);
  console.log(`   Already processed:   ${processed.length}`);
  console.log(`   Need processing:     ${unprocessed.length}`);
  if (orphaned.length > 0) {
    console.log(
      `   Orphaned entries:    ${orphaned.length} (in DB but file deleted)`,
    );
  }

  // Check for missing summaries
  const walksWithoutSummary = getWalksWithoutSummary();
  if (walksWithoutSummary.length > 0) {
    console.log(`   Missing AI summaries: ${walksWithoutSummary.length}`);
  }

  if (unprocessed.length > 0) {
    console.log("\n📭 Unprocessed files:");
    unprocessed.slice(0, 20).forEach((f) => console.log(`   - ${f}`));
    if (unprocessed.length > 20) {
      console.log(`   ... and ${unprocessed.length - 20} more`);
    }
  }

  if (walksWithoutSummary.length > 0) {
    console.log("\n🤖 Files without AI summaries:");
    walksWithoutSummary
      .slice(0, 10)
      .forEach((w) => console.log(`   - ${w.source_file}`));
    if (walksWithoutSummary.length > 10) {
      console.log(`   ... and ${walksWithoutSummary.length - 10} more`);
    }
  }

  if (unprocessed.length === 0 && walksWithoutSummary.length === 0) {
    console.log("\n✅ All files are fully processed with AI summaries!");
  } else {
    console.log("\n💡 Tips:");
    if (unprocessed.length > 0) {
      console.log(
        "   Run 'npm run preprocess' to process new files incrementally",
      );
    }
    if (walksWithoutSummary.length > 0) {
      console.log(
        "   Run 'npm run preprocess -- --summaries' to generate missing AI summaries",
      );
    }
    console.log(
      "   Run 'npm run preprocess -- --force' to rebuild everything from scratch",
    );
  }
}

/**
 * Generate missing AI summaries for existing walks
 */
async function generateMissingSummaries() {
  console.log("🤖 Generating Missing AI Summaries");
  console.log("===================================\n");

  const walksWithoutSummary = getWalksWithoutSummary();

  if (walksWithoutSummary.length === 0) {
    console.log("✅ All walks already have AI summaries!\n");
    return;
  }

  const ollamaAvailable = await isOllamaAvailable();
  if (!ollamaAvailable) {
    console.log("❌ Ollama is not available. Start it with 'ollama serve'\n");
    return;
  }

  const ollamaConfig = getOllamaConfig();
  console.log(`📂 Found ${walksWithoutSummary.length} walks without summaries`);
  console.log(`🤖 Using model: ${ollamaConfig.model}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const walk of walksWithoutSummary) {
    const fullWalk = getWalkBySourceFile(walk.source_file);
    if (!fullWalk) continue;

    try {
      process.stdout.write(
        `   🔄 ${walk.source_file.padEnd(40)} Generating...`,
      );

      const summary = await generateRouteSummary({
        name: fullWalk.name,
        distance: fullWalk.distance_km,
        duration: fullWalk.duration_minutes,
        elevationGain: fullWalk.elevation_gain || 0,
        elevationLoss: fullWalk.elevation_loss || 0,
        date: new Date(fullWalk.date),
      });

      updateWalkSummary(walk.id, summary);
      successCount++;
      process.stdout.write("\r");
      console.log(`   ✅ ${walk.source_file.padEnd(40)} Done ✨`);
    } catch (error) {
      errorCount++;
      process.stdout.write("\r");
      console.log(`   ❌ ${walk.source_file.padEnd(40)} Failed`);
    }
  }

  console.log("\n===================================");
  console.log(`📈 Summary: ${successCount} generated, ${errorCount} failed`);
  console.log(
    `   Total walks with summaries: ${getWalkCount() - getWalksWithoutSummary().length}/${getWalkCount()}\n`,
  );
}

/**
 * Main preprocessing function
 */
async function main() {
  console.log("🚀 GPX Preprocessing Script");
  console.log("==========================\n");

  if (!forceRebuild && !statusOnly && !summariesOnly) {
    console.log("💡 Running in incremental mode (only new files)");
    console.log("   Use --force to rebuild everything");
    console.log("   Use --status to see what needs processing");
    console.log("   Use --summaries to generate missing AI summaries\n");
  }

  // Check if GPX directory exists
  if (!fs.existsSync(GPX_DIR)) {
    console.log(`📁 GPX directory not found: ${GPX_DIR}`);
    console.log("   Creating directory...");
    fs.mkdirSync(GPX_DIR, { recursive: true });
    console.log(
      "   Add your GPX files to public/gpx/ and run this script again.\n",
    );
    process.exit(0);
  }

  // Get all GPX files
  const gpxFiles = fs
    .readdirSync(GPX_DIR)
    .filter((file) => file.toLowerCase().endsWith(".gpx"))
    .map((file) => path.join(GPX_DIR, file));

  if (gpxFiles.length === 0) {
    console.log("📭 No GPX files found in public/gpx/");
    console.log("   Add your GPX files and run this script again.\n");
    process.exit(0);
  }

  // Get already processed files
  const processedFiles = getProcessedSourceFiles();

  // Status only mode
  if (statusOnly) {
    showStatus(gpxFiles, processedFiles);
    closeDb();
    return;
  }

  // Summaries only mode
  if (summariesOnly) {
    await generateMissingSummaries();
    closeDb();
    return;
  }

  console.log(`📂 Found ${gpxFiles.length} GPX files\n`);

  // Check if Ollama is available for AI summaries
  const ollamaAvailable = await isOllamaAvailable();
  const ollamaConfig = getOllamaConfig();
  if (ollamaAvailable) {
    console.log(
      `🤖 Ollama available - will generate AI summaries using ${ollamaConfig.model}`,
    );
  } else {
    console.log("⚠️  Ollama not available - skipping AI summary generation");
    console.log("   Start Ollama with 'ollama serve' to enable summaries\n");
  }

  // Determine which files to process
  let filesToProcess: string[];

  if (forceRebuild) {
    console.log("\n🗑️  Force rebuild: Clearing existing database...");
    clearWalks();
    filesToProcess = gpxFiles;
  } else {
    // Incremental mode - only process new files
    const processedSet = new Set(processedFiles);
    filesToProcess = gpxFiles.filter(
      (f) => !processedSet.has(path.basename(f)),
    );

    if (filesToProcess.length === 0) {
      console.log("\n✅ All files already processed!");

      // Check if there are missing summaries
      const walksWithoutSummary = getWalksWithoutSummary();
      if (walksWithoutSummary.length > 0) {
        console.log(
          `⚠️  ${walksWithoutSummary.length} walks are missing AI summaries`,
        );
        console.log(
          "   Run 'npm run preprocess -- --summaries' to generate them\n",
        );
      }

      console.log(`   Database entries: ${getWalkCount()}`);
      closeDb();
      return;
    }

    console.log(`\n📊 Already processed: ${processedFiles.length} files`);
    console.log(`📥 New files to process: ${filesToProcess.length}`);
  }

  // Process each file
  let successCount = 0;
  let errorCount = 0;
  let summaryCount = 0;
  let totalOriginalPoints = 0;
  let totalSimplifiedPoints = 0;

  console.log("\n📊 Processing files:\n");

  // Use the overall index for color assignment in force mode
  const startIndex = forceRebuild ? 0 : processedFiles.length;

  for (let i = 0; i < filesToProcess.length; i++) {
    const filePath = filesToProcess[i];
    const fileName = path.basename(filePath);
    const colorIndex = startIndex + i;

    try {
      const walk = parseGPXFile(filePath, colorIndex);

      if (walk) {
        // Generate AI summary if Ollama is available
        let summary: string | undefined;
        if (ollamaAvailable) {
          try {
            process.stdout.write(
              `   🔄 ${fileName.padEnd(40)} Generating summary...`,
            );
            summary = await generateRouteSummary({
              name: walk.name,
              distance: walk.distance,
              duration: walk.duration,
              elevationGain: walk.elevationGain,
              elevationLoss: walk.elevationLoss,
              date: walk.date,
            });
            summaryCount++;
            // Clear the line and show success
            process.stdout.write("\r");
          } catch (error) {
            // Clear the line
            process.stdout.write("\r");
            console.log(
              `   ⚠️  ${fileName.padEnd(40)} Summary generation failed`,
            );
          }
        }

        // Insert walk with summary
        insertWalk({ ...walk, summary });
        successCount++;

        const originalCount = walk.coordinatesFull.length;
        const simplifiedCount = walk.coordinatesSimplified.length;
        totalOriginalPoints += originalCount;
        totalSimplifiedPoints += simplifiedCount;

        const reduction = getSimplificationRatio(
          walk.coordinatesFull,
          walk.coordinatesSimplified,
        );

        const summaryIndicator = summary ? "✨" : "  ";
        console.log(
          `   ✅ ${fileName.padEnd(40)} ${originalCount.toString().padStart(5)} → ${simplifiedCount.toString().padStart(4)} pts (${reduction.toFixed(1)}% reduction) ${summaryIndicator}`,
        );
      } else {
        errorCount++;
        console.log(`   ❌ ${fileName.padEnd(40)} Failed to parse`);
      }
    } catch (error) {
      errorCount++;
      console.log(`   ❌ ${fileName.padEnd(40)} Error: ${error}`);
    }
  }

  // Summary
  console.log("\n==========================");
  console.log("📈 Summary:");
  console.log(`   Files processed: ${filesToProcess.length}`);
  console.log(`   Successful:      ${successCount}`);
  console.log(`   Failed:          ${errorCount}`);
  console.log(`   AI summaries:    ${summaryCount}`);
  console.log(`   Original points: ${totalOriginalPoints.toLocaleString()}`);
  console.log(`   Simplified:      ${totalSimplifiedPoints.toLocaleString()}`);
  if (totalOriginalPoints > 0) {
    console.log(
      `   Overall reduction: ${((1 - totalSimplifiedPoints / totalOriginalPoints) * 100).toFixed(1)}%`,
    );
  }
  console.log(`\n   Total database entries: ${getWalkCount()}`);
  console.log("\n✨ Preprocessing complete!\n");

  // Close database
  closeDb();
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  closeDb();
  process.exit(1);
});
