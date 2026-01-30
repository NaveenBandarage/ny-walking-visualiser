/**
 * Douglas-Peucker line simplification algorithm
 * Reduces the number of points in a polyline while preserving its shape
 */

type Coordinate = [number, number];

/**
 * Calculate perpendicular distance from a point to a line segment
 */
function perpendicularDistance(
  point: Coordinate,
  lineStart: Coordinate,
  lineEnd: Coordinate,
): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // If the line segment is a point, return distance to that point
  if (dx === 0 && dy === 0) {
    return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
  }

  // Calculate the perpendicular distance
  const numerator = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(dx ** 2 + dy ** 2);

  return numerator / denominator;
}

/**
 * Douglas-Peucker simplification algorithm
 * @param coordinates Array of [longitude, latitude] coordinates
 * @param tolerance The maximum distance threshold (in degrees, ~0.0001 = ~11m)
 * @returns Simplified array of coordinates
 */
export function simplifyPath(
  coordinates: Coordinate[],
  tolerance: number = 0.0001,
): Coordinate[] {
  if (coordinates.length <= 2) {
    return coordinates;
  }

  // Find the point with the maximum distance from the line between first and last
  let maxDistance = 0;
  let maxIndex = 0;

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  for (let i = 1; i < coordinates.length - 1; i++) {
    const distance = perpendicularDistance(coordinates[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    // Recursive call for both segments
    const left = simplifyPath(coordinates.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPath(coordinates.slice(maxIndex), tolerance);

    // Combine results (remove duplicate point at junction)
    return [...left.slice(0, -1), ...right];
  }

  // All points are within tolerance, return just the endpoints
  return [first, last];
}

/**
 * Simplify path with a target point count
 * Automatically adjusts tolerance to achieve approximately the target count
 * @param coordinates Array of [longitude, latitude] coordinates
 * @param targetCount Target number of points (approximate)
 * @param minPoints Minimum number of points to keep
 * @returns Simplified array of coordinates
 */
export function simplifyToCount(
  coordinates: Coordinate[],
  targetCount: number = 50,
  minPoints: number = 10,
): Coordinate[] {
  if (coordinates.length <= targetCount) {
    return coordinates;
  }

  // Binary search for the right tolerance
  let lowTolerance = 0.00001;
  let highTolerance = 0.01;
  let result = coordinates;
  let iterations = 0;
  const maxIterations = 20;

  while (iterations < maxIterations) {
    const midTolerance = (lowTolerance + highTolerance) / 2;
    result = simplifyPath(coordinates, midTolerance);

    if (result.length < minPoints) {
      // Too few points, reduce tolerance
      highTolerance = midTolerance;
    } else if (result.length > targetCount * 1.5) {
      // Too many points, increase tolerance
      lowTolerance = midTolerance;
    } else if (result.length < targetCount * 0.5) {
      // Too few points, reduce tolerance
      highTolerance = midTolerance;
    } else {
      // Close enough to target
      break;
    }

    iterations++;
  }

  // Ensure we have at least minPoints
  if (result.length < minPoints) {
    return simplifyPath(coordinates, lowTolerance);
  }

  return result;
}

/**
 * Calculate the reduction ratio
 */
export function getSimplificationRatio(
  original: Coordinate[],
  simplified: Coordinate[],
): number {
  if (original.length === 0) return 0;
  return ((original.length - simplified.length) / original.length) * 100;
}
