import Database from "better-sqlite3";
import path from "path";

// Database file path
const DB_PATH = path.join(process.cwd(), "data", "walks.db");

// Singleton database instance
let db: Database.Database | null = null;

/**
 * Get the database connection (singleton)
 */
export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initializeSchema();
  }
  return db;
}

/**
 * Initialize the database schema
 */
function initializeSchema() {
  const database = db!;

  database.exec(`
    CREATE TABLE IF NOT EXISTS walks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      distance_km REAL NOT NULL,
      duration_minutes REAL NOT NULL,
      elevation_gain REAL,
      elevation_loss REAL,
      coordinates_simplified TEXT NOT NULL,
      coordinates_full TEXT NOT NULL,
      points TEXT NOT NULL,
      color TEXT,
      bounds_min_lng REAL NOT NULL,
      bounds_max_lng REAL NOT NULL,
      bounds_min_lat REAL NOT NULL,
      bounds_max_lat REAL NOT NULL,
      source_file TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_walks_bounds ON walks (
      bounds_min_lng, bounds_max_lng, bounds_min_lat, bounds_max_lat
    );

    CREATE INDEX IF NOT EXISTS idx_walks_date ON walks (date);
  `);
}

/**
 * Walk row from database
 */
export interface WalkRow {
  id: string;
  name: string;
  description: string | null;
  date: string;
  distance_km: number;
  duration_minutes: number;
  elevation_gain: number | null;
  elevation_loss: number | null;
  coordinates_simplified: string;
  coordinates_full: string;
  points: string;
  color: string | null;
  bounds_min_lng: number;
  bounds_max_lng: number;
  bounds_min_lat: number;
  bounds_max_lat: number;
  source_file: string | null;
}

/**
 * Insert a walk into the database
 */
export function insertWalk(walk: {
  id: string;
  name: string;
  description?: string;
  date: Date;
  distance: number;
  duration: number;
  elevationGain?: number;
  elevationLoss?: number;
  coordinatesSimplified: [number, number][];
  coordinatesFull: [number, number][];
  points: {
    longitude: number;
    latitude: number;
    elevation?: number;
    time?: Date;
  }[];
  color?: [number, number, number, number];
  sourceFile?: string;
}): void {
  const database = getDb();

  // Calculate bounds
  const bounds = walk.coordinatesFull.reduce(
    (acc, [lng, lat]) => ({
      minLng: Math.min(acc.minLng, lng),
      maxLng: Math.max(acc.maxLng, lng),
      minLat: Math.min(acc.minLat, lat),
      maxLat: Math.max(acc.maxLat, lat),
    }),
    {
      minLng: Infinity,
      maxLng: -Infinity,
      minLat: Infinity,
      maxLat: -Infinity,
    },
  );

  const stmt = database.prepare(`
    INSERT OR REPLACE INTO walks (
      id, name, description, date, distance_km, duration_minutes,
      elevation_gain, elevation_loss, coordinates_simplified, coordinates_full,
      points, color, bounds_min_lng, bounds_max_lng, bounds_min_lat, bounds_max_lat,
      source_file
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  stmt.run(
    walk.id,
    walk.name,
    walk.description || null,
    walk.date.toISOString(),
    walk.distance,
    walk.duration,
    walk.elevationGain || null,
    walk.elevationLoss || null,
    JSON.stringify(walk.coordinatesSimplified),
    JSON.stringify(walk.coordinatesFull),
    JSON.stringify(walk.points),
    walk.color ? JSON.stringify(walk.color) : null,
    bounds.minLng,
    bounds.maxLng,
    bounds.minLat,
    bounds.maxLat,
    walk.sourceFile || null,
  );
}

/**
 * Get all walks with simplified coordinates
 */
export function getAllWalksSimplified(): WalkRow[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT id, name, description, date, distance_km, duration_minutes,
              elevation_gain, elevation_loss, coordinates_simplified, color,
              bounds_min_lng, bounds_max_lng, bounds_min_lat, bounds_max_lat
       FROM walks
       ORDER BY date DESC`,
    )
    .all() as WalkRow[];
}

/**
 * Get walks within a viewport bounds
 */
export function getWalksInBounds(
  minLng: number,
  maxLng: number,
  minLat: number,
  maxLat: number,
): WalkRow[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT id, name, description, date, distance_km, duration_minutes,
              elevation_gain, elevation_loss, coordinates_simplified, color,
              bounds_min_lng, bounds_max_lng, bounds_min_lat, bounds_max_lat
       FROM walks
       WHERE bounds_max_lng >= ? AND bounds_min_lng <= ?
         AND bounds_max_lat >= ? AND bounds_min_lat <= ?
       ORDER BY date DESC`,
    )
    .all(minLng, maxLng, minLat, maxLat) as WalkRow[];
}

/**
 * Get a single walk with full coordinates
 */
export function getWalkFull(id: string): WalkRow | undefined {
  const database = getDb();
  return database.prepare(`SELECT * FROM walks WHERE id = ?`).get(id) as
    | WalkRow
    | undefined;
}

/**
 * Get total count of walks
 */
export function getWalkCount(): number {
  const database = getDb();
  const result = database
    .prepare(`SELECT COUNT(*) as count FROM walks`)
    .get() as { count: number };
  return result.count;
}

/**
 * Get aggregated statistics
 */
export function getStats(): {
  totalWalks: number;
  totalDistance: number;
  totalDuration: number;
} {
  const database = getDb();
  const result = database
    .prepare(
      `SELECT 
        COUNT(*) as total_walks,
        COALESCE(SUM(distance_km), 0) as total_distance,
        COALESCE(SUM(duration_minutes), 0) as total_duration
       FROM walks`,
    )
    .get() as {
    total_walks: number;
    total_distance: number;
    total_duration: number;
  };

  return {
    totalWalks: result.total_walks,
    totalDistance: result.total_distance,
    totalDuration: result.total_duration,
  };
}

/**
 * Clear all walks from the database
 */
export function clearWalks(): void {
  const database = getDb();
  database.exec(`DELETE FROM walks`);
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if database exists and has data
 */
export function isDatabaseReady(): boolean {
  try {
    const count = getWalkCount();
    return count > 0;
  } catch {
    return false;
  }
}
