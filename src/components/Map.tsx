"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import MapGL, { MapRef } from "react-map-gl/mapbox";
import { DeckGL } from "@deck.gl/react";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { ViewState, PickedWalk, WalkPoint } from "@/lib/types";

import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Extended Walk type with LOD support
interface WalkWithLOD {
  id: string;
  name: string;
  description?: string;
  date: Date;
  coordinates: [number, number][];
  coordinatesFull?: [number, number][];
  points: WalkPoint[];
  pointsFull?: WalkPoint[];
  distance: number;
  duration: number;
  elevationGain?: number;
  elevationLoss?: number;
  color?: [number, number, number, number];
  bounds?: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
}

// Zoom level threshold for LOD
const HIGH_DETAIL_ZOOM = 14;

// Selection marker travel duration (seconds)
const MARKER_TRAVEL_DURATION = 8;

function buildPathMetrics(
  coordinates: [number, number][],
): {
  coordinates: [number, number][];
  cumulativeLengths: number[];
  totalLength: number;
} | null {
  if (coordinates.length < 2) return null;

  const cumulativeLengths = [0];
  let totalLength = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lng0, lat0] = coordinates[i - 1];
    const [lng1, lat1] = coordinates[i];
    const segmentLength = Math.hypot(lng1 - lng0, lat1 - lat0);
    totalLength += segmentLength;
    cumulativeLengths.push(totalLength);
  }

  if (totalLength === 0) return null;

  return { coordinates, cumulativeLengths, totalLength };
}

function getPositionAtProgress(
  metrics: {
    coordinates: [number, number][];
    cumulativeLengths: number[];
    totalLength: number;
  },
  progress: number,
): [number, number] {
  const target = metrics.totalLength * progress;

  for (let i = 1; i < metrics.cumulativeLengths.length; i++) {
    const segmentEnd = metrics.cumulativeLengths[i];
    if (segmentEnd >= target) {
      const segmentStart = metrics.cumulativeLengths[i - 1];
      const segmentLength = Math.max(0.000001, segmentEnd - segmentStart);
      const segmentProgress = (target - segmentStart) / segmentLength;
      const [lng0, lat0] = metrics.coordinates[i - 1];
      const [lng1, lat1] = metrics.coordinates[i];
      return [
        lng0 + (lng1 - lng0) * segmentProgress,
        lat0 + (lat1 - lat0) * segmentProgress,
      ];
    }
  }

  return metrics.coordinates[metrics.coordinates.length - 1];
}

const MIN_SEQUENCE_DURATION_SECONDS = 2.5;
const MAX_SEQUENCE_DURATION_SECONDS = 12;
const SECONDS_PER_ROUTE = 0.05;

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getSequenceDurationSeconds(count: number): number {
  if (count <= 0) return MIN_SEQUENCE_DURATION_SECONDS;
  const duration = count * SECONDS_PER_ROUTE;
  return Math.min(
    MAX_SEQUENCE_DURATION_SECONDS,
    Math.max(MIN_SEQUENCE_DURATION_SECONDS, duration),
  );
}

// NYC centered view
const INITIAL_VIEW_STATE: ViewState = {
  longitude: -73.985,
  latitude: 40.748,
  zoom: 12,
  pitch: 0,
  bearing: 0,
};

interface MapProps {
  walks: WalkWithLOD[];
  selectedWalk: WalkWithLOD | null;
  onWalkClick: (picked: PickedWalk[]) => void;
  onMapClick: () => void;
}

// Check if two walks overlap at a given point
function findOverlappingWalks(
  walks: WalkWithLOD[],
  clickedWalk: WalkWithLOD,
  clickPoint: [number, number],
  threshold: number = 0.0005, // roughly 50 meters
): WalkWithLOD[] {
  return walks.filter((walk) => {
    if (walk.id === clickedWalk.id) return true;
    // Check if any point of this walk is near the click point
    return walk.coordinates.some(
      (coord) =>
        Math.abs(coord[0] - clickPoint[0]) < threshold &&
        Math.abs(coord[1] - clickPoint[1]) < threshold,
    );
  });
}

// Check if a walk's bounds intersect with the viewport
function isWalkInViewport(
  walk: WalkWithLOD,
  viewportBounds: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  },
): boolean {
  if (!walk.bounds) return true; // If no bounds, assume visible

  return !(
    walk.bounds.maxLng < viewportBounds.minLng ||
    walk.bounds.minLng > viewportBounds.maxLng ||
    walk.bounds.maxLat < viewportBounds.minLat ||
    walk.bounds.minLat > viewportBounds.maxLat
  );
}

// Calculate viewport bounds from view state
function getViewportBounds(
  viewState: ViewState,
  width: number = 1920,
  height: number = 1080,
): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  // Approximate viewport bounds based on zoom and center
  // This is a simplified calculation
  const latRange = 180 / Math.pow(2, viewState.zoom);
  const lngRange = (360 / Math.pow(2, viewState.zoom)) * (width / height);

  return {
    minLng: viewState.longitude - lngRange / 2,
    maxLng: viewState.longitude + lngRange / 2,
    minLat: viewState.latitude - latRange / 2,
    maxLat: viewState.latitude + latRange / 2,
  };
}

export default function WalkMap({
  walks,
  selectedWalk,
  onWalkClick,
  onMapClick,
}: MapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState<ViewState>(INITIAL_VIEW_STATE);
  const [hoveredWalkId, setHoveredWalkId] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [markerProgress, setMarkerProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [hasSequencePlayed, setHasSequencePlayed] = useState(false);
  const sequenceAnimationRef = useRef<number | null>(null);

  // Determine if we should use high detail based on zoom level
  const useHighDetail = viewState.zoom >= HIGH_DETAIL_ZOOM;

  // Calculate viewport bounds for culling
  const viewportBounds = useMemo(
    () => getViewportBounds(viewState),
    [viewState.longitude, viewState.latitude, viewState.zoom],
  );

  // Filter walks to only those in viewport (viewport culling)
  const visibleWalks = useMemo(() => {
    // Always show all walks at low zoom to avoid pop-in
    if (viewState.zoom < 10) return walks;

    return walks.filter((walk) => isWalkInViewport(walk, viewportBounds));
  }, [walks, viewportBounds, viewState.zoom]);

  const walkOrderIndex = useMemo(() => {
    return new Map(walks.map((walk, index) => [walk.id, index]));
  }, [walks]);

  const animatedVisibleWalks = useMemo(() => {
    if (revealedCount >= walks.length) return visibleWalks;

    const limit = Math.max(0, Math.min(walks.length, revealedCount));
    return visibleWalks.filter((walk) => {
      if (selectedWalk?.id === walk.id) return true;
      const index = walkOrderIndex.get(walk.id);
      return index !== undefined && index < limit;
    });
  }, [
    revealedCount,
    visibleWalks,
    walkOrderIndex,
    walks.length,
    selectedWalk?.id,
  ]);

  // Animate a subtle selection marker traveling along the path
  useEffect(() => {
    if (selectedWalk) {
      let lastTime = performance.now();
      setMarkerProgress(0);
      const animate = (currentTime: number) => {
        const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
        lastTime = currentTime;
        setMarkerProgress((t) => (t + deltaTime / MARKER_TRAVEL_DURATION) % 1);
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    } else {
      setMarkerProgress(0);
    }
  }, [selectedWalk]);

  const startSequence = useCallback(() => {
    if (walks.length === 0) return;

    if (sequenceAnimationRef.current) {
      cancelAnimationFrame(sequenceAnimationRef.current);
    }

    const total = walks.length;
    const durationSeconds = getSequenceDurationSeconds(total);
    const startTime = performance.now();

    setIsSequencePlaying(true);
    setHasSequencePlayed(true);
    setRevealedCount(0);

    const animate = (currentTime: number) => {
      const elapsedSeconds = (currentTime - startTime) / 1000;
      const rawProgress = Math.min(1, elapsedSeconds / durationSeconds);
      const easedProgress = easeInOutCubic(rawProgress);
      const nextCount = Math.max(
        0,
        Math.min(total, Math.floor(easedProgress * total)),
      );

      setRevealedCount((prev) => (prev === nextCount ? prev : nextCount));

      if (rawProgress < 1) {
        sequenceAnimationRef.current = requestAnimationFrame(animate);
      } else {
        setIsSequencePlaying(false);
        setRevealedCount(total);
      }
    };

    sequenceAnimationRef.current = requestAnimationFrame(animate);
  }, [walks.length]);

  useEffect(() => {
    if (walks.length === 0) {
      setRevealedCount(0);
      return;
    }

    if (!hasSequencePlayed) {
      startSequence();
    } else if (!isSequencePlaying) {
      setRevealedCount(walks.length);
    }
  }, [walks.length, hasSequencePlayed, isSequencePlaying, startSequence]);

  useEffect(() => {
    return () => {
      if (sequenceAnimationRef.current) {
        cancelAnimationFrame(sequenceAnimationRef.current);
      }
    };
  }, []);

  // Ensure we're fully mounted on client before initializing WebGL
  useEffect(() => {
    // Register only WebGL adapter to prevent WebGPU initialization errors
    // This must happen before DeckGL creates its device
    import("@luma.gl/core")
      .then(({ luma }) => {
        import("@luma.gl/webgl").then(({ webgl2Adapter }) => {
          // Clear any existing adapters and register only WebGL2
          luma.registerAdapters([webgl2Adapter]);
          setIsClientReady(true);
        });
      })
      .catch((err) => {
        console.warn("Failed to initialize WebGL adapter:", err);
        // Still allow rendering - DeckGL might work anyway
        setIsClientReady(true);
      });
  }, []);

  const selectedPathMetrics = useMemo(() => {
    if (!selectedWalk) return null;
    const coords = selectedWalk.coordinatesFull || selectedWalk.coordinates;
    return buildPathMetrics(coords);
  }, [
    selectedWalk?.id,
    selectedWalk?.coordinatesFull?.length,
    selectedWalk?.coordinates.length,
  ]);

  const markerPosition = useMemo(() => {
    if (!selectedPathMetrics) return null;
    return getPositionAtProgress(selectedPathMetrics, markerProgress);
  }, [selectedPathMetrics, markerProgress]);

  // Get coordinates for a walk, using full coordinates when available and appropriate
  const getWalkCoordinates = useCallback(
    (
      walk: WalkWithLOD,
      forceHighDetail: boolean = false,
    ): [number, number][] => {
      // Use full coordinates if:
      // 1. This is the selected walk (always show full detail)
      // 2. We're zoomed in far enough AND full coordinates are available
      if (forceHighDetail || selectedWalk?.id === walk.id) {
        return walk.coordinatesFull || walk.coordinates;
      }
      if (useHighDetail && walk.coordinatesFull) {
        return walk.coordinatesFull;
      }
      return walk.coordinates;
    },
    [selectedWalk?.id, useHighDetail],
  );

  // Create the path layers with a subtle selection marker
  const layers = useMemo(() => {
    const baseLayers = [
      // Main walks layer - uses viewport-culled + sequence-animated walks
      new PathLayer<WalkWithLOD>({
        id: "walks-layer",
        data: animatedVisibleWalks,
        getPath: (d) => getWalkCoordinates(d),
        getColor: (d) => {
          const baseColor = d.color || [255, 255, 255, 150];
          // Highlight selected walk using its original color
          if (selectedWalk?.id === d.id) {
            return [
              baseColor[0],
              baseColor[1],
              baseColor[2],
              Math.max(baseColor[3], 230),
            ];
          }
          // Dim other routes when one is selected
          if (selectedWalk) {
            if (hoveredWalkId === d.id) {
              return [
                baseColor[0],
                baseColor[1],
                baseColor[2],
                Math.max(90, Math.round(baseColor[3] * 0.6)),
              ];
            }
            // Significantly dim non-selected routes
            return [
              baseColor[0],
              baseColor[1],
              baseColor[2],
              Math.max(50, Math.round(baseColor[3] * 0.35)),
            ];
          }
          // Normal state (no selection)
          if (hoveredWalkId === d.id) {
            return [
              baseColor[0],
              baseColor[1],
              baseColor[2],
              Math.max(200, baseColor[3]),
            ];
          }
          return baseColor;
        },
        getWidth: (d) => {
          if (selectedWalk?.id === d.id) {
            return 4.5;
          }
          if (hoveredWalkId === d.id) {
            return 3;
          }
          // Make non-selected routes thinner when one is selected
          if (selectedWalk) {
            return 1.5;
          }
          return 2;
        },
        widthUnits: "pixels",
        widthMinPixels: 1,
        widthMaxPixels: 10,
        pickable: true,
        autoHighlight: true,
        highlightColor: selectedWalk
          ? [150, 150, 150, 150]
          : [255, 255, 255, 255],
        capRounded: true,
        jointRounded: true,
        updateTriggers: {
          getColor: [selectedWalk?.id, hoveredWalkId],
          getWidth: [selectedWalk?.id, hoveredWalkId],
          getPath: [useHighDetail, revealedCount],
        },
      }),
    ];

    if (selectedWalk && markerPosition) {
      const baseColor = selectedWalk.color || [255, 255, 255, 180];
      baseLayers.push(
        new ScatterplotLayer({
          id: "selected-marker",
          data: [{ position: markerPosition }],
          getPosition: (d: { position: [number, number] }) => d.position,
          getFillColor: [
            baseColor[0],
            baseColor[1],
            baseColor[2],
            255,
          ],
          getLineColor: [0, 0, 0, 160],
          stroked: true,
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 1,
          lineWidthMaxPixels: 2,
          getRadius: 5,
          radiusUnits: "pixels",
          radiusMinPixels: 3,
          radiusMaxPixels: 7,
          pickable: false,
          updateTriggers: {
            getPosition: [markerPosition[0], markerPosition[1]],
          },
        }),
      );
    }

    return baseLayers;
  }, [
    animatedVisibleWalks,
    selectedWalk,
    hoveredWalkId,
    getWalkCoordinates,
    useHighDetail,
    revealedCount,
    markerPosition,
  ]);

  const handleClick = useCallback(
    (info: PickingInfo<WalkWithLOD>) => {
      if (!info.object) {
        onMapClick();
        return;
      }

      const clickedWalk = info.object;
      const coordinate = info.coordinate as [number, number] | undefined;

      if (coordinate) {
        // Find all walks that overlap at this point
        const overlapping = findOverlappingWalks(
          animatedVisibleWalks,
          clickedWalk,
          coordinate,
        );

        const pickedWalks: PickedWalk[] = overlapping.map((walk) => ({
          walk: walk as unknown as import("@/lib/types").Walk,
          x: info.x || 0,
          y: info.y || 0,
        }));

        onWalkClick(pickedWalks);
      } else {
        // Fallback to single selection
        onWalkClick([
          {
            walk: clickedWalk as unknown as import("@/lib/types").Walk,
            x: info.x || 0,
            y: info.y || 0,
          },
        ]);
      }
    },
    [animatedVisibleWalks, onWalkClick, onMapClick],
  );

  const handleHover = useCallback((info: PickingInfo<WalkWithLOD>) => {
    setHoveredWalkId(info.object?.id || null);
  }, []);

  // Fit bounds to show all walks when data loads
  useEffect(() => {
    if (walks.length > 0 && mapRef.current) {
      // Use precomputed bounds if available
      const walksWithBounds = walks.filter((w) => w.bounds);

      if (walksWithBounds.length > 0) {
        // Calculate bounds from precomputed walk bounds
        const bounds = walksWithBounds.reduce(
          (acc, walk) => ({
            minLng: Math.min(acc.minLng, walk.bounds!.minLng),
            maxLng: Math.max(acc.maxLng, walk.bounds!.maxLng),
            minLat: Math.min(acc.minLat, walk.bounds!.minLat),
            maxLat: Math.max(acc.maxLat, walk.bounds!.maxLat),
          }),
          {
            minLng: Infinity,
            maxLng: -Infinity,
            minLat: Infinity,
            maxLat: -Infinity,
          },
        );

        mapRef.current.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          {
            padding: 50,
            duration: 1000,
          },
        );
      } else {
        // Fallback to calculating from coordinates
        const allCoords = walks.flatMap((w) => w.coordinates);
        if (allCoords.length > 0) {
          const bounds = allCoords.reduce(
            (acc, coord) => ({
              minLng: Math.min(acc.minLng, coord[0]),
              maxLng: Math.max(acc.maxLng, coord[0]),
              minLat: Math.min(acc.minLat, coord[1]),
              maxLat: Math.max(acc.maxLat, coord[1]),
            }),
            {
              minLng: Infinity,
              maxLng: -Infinity,
              minLat: Infinity,
              maxLat: -Infinity,
            },
          );

          mapRef.current.fitBounds(
            [
              [bounds.minLng, bounds.minLat],
              [bounds.maxLng, bounds.maxLat],
            ],
            {
              padding: 50,
              duration: 1000,
            },
          );
        }
      }
    }
  }, [walks]);

  // Focus on selected walk
  useEffect(() => {
    if (selectedWalk && mapRef.current) {
      // Use precomputed bounds if available
      if (selectedWalk.bounds) {
        mapRef.current.fitBounds(
          [
            [selectedWalk.bounds.minLng, selectedWalk.bounds.minLat],
            [selectedWalk.bounds.maxLng, selectedWalk.bounds.maxLat],
          ],
          {
            padding: 100,
            duration: 500,
          },
        );
      } else {
        // Fallback to calculating from coordinates
        const coords = selectedWalk.coordinatesFull || selectedWalk.coordinates;
        if (coords.length > 0) {
          const bounds = coords.reduce(
            (acc, coord) => ({
              minLng: Math.min(acc.minLng, coord[0]),
              maxLng: Math.max(acc.maxLng, coord[0]),
              minLat: Math.min(acc.minLat, coord[1]),
              maxLat: Math.max(acc.maxLat, coord[1]),
            }),
            {
              minLng: Infinity,
              maxLng: -Infinity,
              minLat: Infinity,
              maxLat: -Infinity,
            },
          );

          mapRef.current.fitBounds(
            [
              [bounds.minLng, bounds.minLat],
              [bounds.maxLng, bounds.maxLat],
            ],
            {
              padding: 100,
              duration: 500,
            },
          );
        }
      }
    }
  }, [selectedWalk]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="text-center p-8">
          <p className="text-white/80 mb-2">Mapbox token not configured</p>
          <p className="text-white/50 text-sm">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to your .env.local file
          </p>
        </div>
      </div>
    );
  }

  // Wait for WebGL adapter to be registered
  if (!isClientReady) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="text-white/50 font-mono text-sm">Initializing...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-auto">
        <button
          type="button"
          onClick={startSequence}
          disabled={isSequencePlaying || walks.length === 0}
          className={`panel-glass flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-wider transition ${
            isSequencePlaying || walks.length === 0
              ? "text-white/30 border-white/10 cursor-not-allowed"
              : "text-white/70 hover:text-white hover:border-white/30"
          }`}
          aria-label={
            isSequencePlaying
              ? "Playing route sequence"
              : hasSequencePlayed
                ? "Replay route sequence"
                : "Play route sequence"
          }
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M3 2.5L10 6L3 9.5V2.5Z" />
          </svg>
          <span>
            {isSequencePlaying
              ? "Playing"
              : hasSequencePlayed
                ? "Replay"
                : "Play"}
          </span>
        </button>
      </div>
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs as ViewState)}
        controller={true}
        layers={layers}
        onClick={handleClick}
        onHover={handleHover}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      >
        <MapGL
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          attributionControl={true}
          reuseMaps
        />
      </DeckGL>
    </div>
  );
}
