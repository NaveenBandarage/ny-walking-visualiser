"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useRef,
} from "react";
import { Walk, WalkStats, PickedWalk, WalkPoint } from "./types";

// Extended Walk type with optional full coordinates
interface WalkWithLOD extends Walk {
  coordinatesFull?: [number, number][];
  pointsFull?: WalkPoint[];
  bounds?: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
}

interface WalksContextType {
  walks: WalkWithLOD[];
  stats: WalkStats;
  isLoading: boolean;
  selectedWalk: WalkWithLOD | null;
  overlappingWalks: WalkWithLOD[];
  overlayPosition: { x: number; y: number } | null;
  selectWalk: (walk: WalkWithLOD | null) => void;
  handleWalkClick: (picked: PickedWalk[]) => void;
  handleOverlapSelect: (walk: WalkWithLOD) => void;
  closeOverlay: () => void;
  refreshWalks: () => Promise<void>;
  loadFullCoordinates: (walkId: string) => Promise<void>;
}

const WalksContext = createContext<WalksContextType | null>(null);

export function useWalks() {
  const context = useContext(WalksContext);
  if (!context) {
    throw new Error("useWalks must be used within a WalksProvider");
  }
  return context;
}

interface WalksProviderProps {
  children: ReactNode;
}

export function WalksProvider({ children }: WalksProviderProps) {
  const [walks, setWalks] = useState<WalkWithLOD[]>([]);
  const [stats, setStats] = useState<WalkStats>({
    totalWalks: 0,
    totalDistance: 0,
    totalDuration: 0,
    averageDistance: 0,
    averageDuration: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWalk, setSelectedWalk] = useState<WalkWithLOD | null>(null);
  const [overlappingWalks, setOverlappingWalks] = useState<WalkWithLOD[]>([]);
  const [overlayPosition, setOverlayPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Cache for full coordinates
  const fullCoordinatesCache = useRef<
    Map<string, { coordinates: [number, number][]; points: WalkPoint[] }>
  >(new Map());

  // Load walks from the new API
  const refreshWalks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/walks");
      const data = await response.json();

      if (data.error) {
        console.warn("Walks API warning:", data.error);
      }

      if (data.walks && data.walks.length > 0) {
        // Transform API response to Walk objects
        const transformedWalks: WalkWithLOD[] = data.walks.map(
          (w: {
            id: string;
            name: string;
            description?: string;
            summary?: string;
            date: string;
            distance: number;
            duration: number;
            elevationGain?: number;
            elevationLoss?: number;
            coordinates: [number, number][];
            color?: [number, number, number, number];
            bounds?: {
              minLng: number;
              maxLng: number;
              minLat: number;
              maxLat: number;
            };
          }) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            summary: w.summary,
            date: new Date(w.date),
            distance: w.distance,
            duration: w.duration,
            elevationGain: w.elevationGain,
            elevationLoss: w.elevationLoss,
            coordinates: w.coordinates,
            points: [], // Points are loaded on demand
            color: w.color,
            bounds: w.bounds,
          }),
        );

        setWalks(transformedWalks);
      } else {
        setWalks([]);
      }

      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error loading walks:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWalks();
  }, [refreshWalks]);

  // Load full coordinates for a specific walk
  const loadFullCoordinates = useCallback(async (walkId: string) => {
    // Check cache first
    if (fullCoordinatesCache.current.has(walkId)) {
      return;
    }

    try {
      const response = await fetch(`/api/walks/${walkId}`);
      const data = await response.json();

      if (data.walk) {
        const fullCoords = data.walk.coordinates;
        const fullPoints = data.walk.points.map(
          (p: {
            longitude: number;
            latitude: number;
            elevation?: number;
            time?: string;
          }) => ({
            ...p,
            time: p.time ? new Date(p.time) : undefined,
          }),
        );

        // Cache the full coordinates
        fullCoordinatesCache.current.set(walkId, {
          coordinates: fullCoords,
          points: fullPoints,
        });

        // Update the walk in state with full coordinates
        setWalks((prev) =>
          prev.map((w) =>
            w.id === walkId
              ? { ...w, coordinatesFull: fullCoords, pointsFull: fullPoints }
              : w,
          ),
        );

        // Update selected walk if it matches
        setSelectedWalk((prev) =>
          prev?.id === walkId
            ? { ...prev, coordinatesFull: fullCoords, pointsFull: fullPoints }
            : prev,
        );
      }
    } catch (error) {
      console.error("Error loading full coordinates:", error);
    }
  }, []);

  const selectWalk = useCallback(
    (walk: WalkWithLOD | null) => {
      setSelectedWalk(walk);
      setOverlappingWalks([]);
      setOverlayPosition(null);

      // Load full coordinates when a walk is selected
      if (walk && !walk.coordinatesFull) {
        loadFullCoordinates(walk.id);
      }
    },
    [loadFullCoordinates],
  );

  const handleWalkClick = useCallback(
    (picked: PickedWalk[]) => {
      if (picked.length === 0) {
        return;
      }

      if (picked.length === 1) {
        // Single walk clicked - select it directly
        const walk = picked[0].walk as WalkWithLOD;
        setSelectedWalk(walk);
        setOverlappingWalks([]);
        setOverlayPosition(null);

        // Load full coordinates
        if (!walk.coordinatesFull) {
          loadFullCoordinates(walk.id);
        }
      } else {
        // Multiple walks overlapping - show selector
        setOverlappingWalks(picked.map((p) => p.walk as WalkWithLOD));
        setOverlayPosition({ x: picked[0].x, y: picked[0].y });
        setSelectedWalk(null);
      }
    },
    [loadFullCoordinates],
  );

  const handleOverlapSelect = useCallback(
    (walk: WalkWithLOD) => {
      setSelectedWalk(walk);
      setOverlappingWalks([]);
      setOverlayPosition(null);

      // Load full coordinates
      if (!walk.coordinatesFull) {
        loadFullCoordinates(walk.id);
      }
    },
    [loadFullCoordinates],
  );

  const closeOverlay = useCallback(() => {
    setOverlappingWalks([]);
    setOverlayPosition(null);
  }, []);

  return (
    <WalksContext.Provider
      value={{
        walks,
        stats,
        isLoading,
        selectedWalk,
        overlappingWalks,
        overlayPosition,
        selectWalk,
        handleWalkClick,
        handleOverlapSelect,
        closeOverlay,
        refreshWalks,
        loadFullCoordinates,
      }}
    >
      {children}
    </WalksContext.Provider>
  );
}
