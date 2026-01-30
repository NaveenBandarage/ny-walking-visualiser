import { Walk, WalkStats, WalkPoint } from "./types";

/**
 * Calculate the distance between two coordinates using the Haversine formula
 */
export function haversineDistance(
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
export function calculatePathDistance(points: WalkPoint[]): number {
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
export function calculateDuration(points: WalkPoint[]): number {
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
export function calculateElevation(points: WalkPoint[]): {
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
 * Calculate statistics for a collection of walks
 */
export function calculateWalkStats(walks: Walk[]): WalkStats {
  const totalDistance = walks.reduce((sum, w) => sum + w.distance, 0);
  const totalDuration = walks.reduce((sum, w) => sum + w.duration, 0);

  return {
    totalWalks: walks.length,
    totalDistance,
    totalDuration,
    averageDistance: walks.length > 0 ? totalDistance / walks.length : 0,
    averageDuration: walks.length > 0 ? totalDuration / walks.length : 0,
  };
}

/**
 * Format distance for display
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

/**
 * Format duration for display
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)}min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Get a color for a walk based on its index
 */
export function getWalkColor(index: number): [number, number, number, number] {
  // Subtle white/gray variations for minimalist look
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
