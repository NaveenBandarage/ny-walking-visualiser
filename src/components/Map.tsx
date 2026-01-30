"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import MapGL, { MapRef } from "react-map-gl/mapbox";
import { DeckGL } from "@deck.gl/react";
import { PathLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { Walk, ViewState, PickedWalk } from "@/lib/types";

import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Vibrant selected route color (cyan/teal)
const SELECTED_COLOR: [number, number, number, number] = [0, 255, 220, 255];
const SELECTED_GLOW_COLOR: [number, number, number] = [0, 255, 220];

// Heartbeat animation curve - sharp spikes followed by rest
function heartbeatCurve(t: number): number {
  // t is 0-1, representing one full heartbeat cycle
  // Creates a double-beat pattern like a real heartbeat (lub-dub)

  if (t < 0.1) {
    // First beat (lub) - sharp spike up
    const progress = t / 0.1;
    return Math.sin(progress * Math.PI) * 1.0;
  } else if (t < 0.15) {
    // Quick dip
    const progress = (t - 0.1) / 0.05;
    return -0.2 * Math.sin(progress * Math.PI);
  } else if (t < 0.25) {
    // Second beat (dub) - smaller spike
    const progress = (t - 0.15) / 0.1;
    return Math.sin(progress * Math.PI) * 0.6;
  } else {
    // Rest period - flat baseline with subtle decay
    const progress = (t - 0.25) / 0.75;
    return Math.max(0, 0.1 * (1 - progress));
  }
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
  walks: Walk[];
  selectedWalk: Walk | null;
  onWalkClick: (picked: PickedWalk[]) => void;
  onMapClick: () => void;
}

// Check if two walks overlap at a given point
function findOverlappingWalks(
  walks: Walk[],
  clickedWalk: Walk,
  clickPoint: [number, number],
  threshold: number = 0.0005, // roughly 50 meters
): Walk[] {
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

export default function Map({
  walks,
  selectedWalk,
  onWalkClick,
  onMapClick,
}: MapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState<ViewState>(INITIAL_VIEW_STATE);
  const [hoveredWalkId, setHoveredWalkId] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [animationTime, setAnimationTime] = useState(0);
  const animationRef = useRef<number | null>(null);

  // Heartbeat animation for selected route
  useEffect(() => {
    if (selectedWalk) {
      let lastTime = performance.now();
      const animate = (currentTime: number) => {
        const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
        lastTime = currentTime;
        // One full heartbeat cycle every ~1.2 seconds (50 BPM - calm heartbeat)
        setAnimationTime((t) => (t + deltaTime / 1.2) % 1);
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    } else {
      setAnimationTime(0);
    }
  }, [selectedWalk]);

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

  // Calculate heartbeat pulse values for animation
  const heartbeat = heartbeatCurve(animationTime);
  // Opacity pulses with heartbeat - baseline 0.4, peaks at 1.0
  const pulseOpacity = 0.4 + heartbeat * 0.6;
  // Width pulses with heartbeat - baseline 8, peaks at 18
  const pulseWidth = 8 + heartbeat * 10;
  // Glow intensity for outer layers
  const glowIntensity = 30 + heartbeat * 40;

  // Create the path layers with glow and pulse effects
  const layers = useMemo(
    () => [
      // Outer glow layer for selected route (widest, pulses with heartbeat)
      ...(selectedWalk
        ? [
            new PathLayer<Walk>({
              id: "selected-glow-outer",
              data: [selectedWalk],
              getPath: (d) => d.coordinates,
              getColor: [...SELECTED_GLOW_COLOR, Math.round(glowIntensity)] as [
                number,
                number,
                number,
                number,
              ],
              getWidth: 20 + heartbeat * 8,
              widthUnits: "pixels",
              widthMinPixels: 16,
              widthMaxPixels: 40,
              pickable: false,
              capRounded: true,
              jointRounded: true,
              updateTriggers: {
                getColor: [animationTime],
                getWidth: [animationTime],
              },
            }),
            // Middle glow layer - pulses with heartbeat
            new PathLayer<Walk>({
              id: "selected-glow-middle",
              data: [selectedWalk],
              getPath: (d) => d.coordinates,
              getColor: [
                ...SELECTED_GLOW_COLOR,
                Math.round(50 + heartbeat * 50),
              ] as [number, number, number, number],
              getWidth: 12 + heartbeat * 4,
              widthUnits: "pixels",
              widthMinPixels: 10,
              widthMaxPixels: 24,
              pickable: false,
              capRounded: true,
              jointRounded: true,
              updateTriggers: {
                getColor: [animationTime],
                getWidth: [animationTime],
              },
            }),
            // Inner pulsing glow layer - main heartbeat effect
            new PathLayer<Walk>({
              id: "selected-pulse",
              data: [selectedWalk],
              getPath: (d) => d.coordinates,
              getColor: [
                ...SELECTED_GLOW_COLOR,
                Math.round(pulseOpacity * 255),
              ] as [number, number, number, number],
              getWidth: pulseWidth,
              widthUnits: "pixels",
              widthMinPixels: 6,
              widthMaxPixels: 22,
              pickable: false,
              capRounded: true,
              jointRounded: true,
              updateTriggers: {
                getColor: [animationTime],
                getWidth: [animationTime],
              },
            }),
          ]
        : []),
      // Main walks layer
      new PathLayer<Walk>({
        id: "walks-layer",
        data: walks,
        getPath: (d) => d.coordinates,
        getColor: (d) => {
          // Highlight selected walk with vibrant color
          if (selectedWalk?.id === d.id) {
            return SELECTED_COLOR;
          }
          // Dim other routes when one is selected
          if (selectedWalk) {
            if (hoveredWalkId === d.id) {
              return [255, 255, 255, 100];
            }
            // Significantly dim non-selected routes
            return [100, 100, 100, 60];
          }
          // Normal state (no selection)
          if (hoveredWalkId === d.id) {
            return [255, 255, 255, 220];
          }
          return d.color || [255, 255, 255, 150];
        },
        getWidth: (d) => {
          if (selectedWalk?.id === d.id) {
            return 5;
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
        },
      }),
    ],
    [
      walks,
      selectedWalk,
      hoveredWalkId,
      animationTime,
      pulseOpacity,
      pulseWidth,
      glowIntensity,
      heartbeat,
    ],
  );

  const handleClick = useCallback(
    (info: PickingInfo<Walk>) => {
      if (!info.object) {
        onMapClick();
        return;
      }

      const clickedWalk = info.object;
      const coordinate = info.coordinate as [number, number] | undefined;

      if (coordinate) {
        // Find all walks that overlap at this point
        const overlapping = findOverlappingWalks(
          walks,
          clickedWalk,
          coordinate,
        );

        const pickedWalks: PickedWalk[] = overlapping.map((walk) => ({
          walk,
          x: info.x || 0,
          y: info.y || 0,
        }));

        onWalkClick(pickedWalks);
      } else {
        // Fallback to single selection
        onWalkClick([{ walk: clickedWalk, x: info.x || 0, y: info.y || 0 }]);
      }
    },
    [walks, onWalkClick, onMapClick],
  );

  const handleHover = useCallback((info: PickingInfo<Walk>) => {
    setHoveredWalkId(info.object?.id || null);
  }, []);

  // Fit bounds to show all walks when data loads
  useEffect(() => {
    if (walks.length > 0 && mapRef.current) {
      const allCoords = walks.flatMap((w) => w.coordinates);
      if (allCoords.length > 0) {
        // Use reduce instead of spread to avoid call stack overflow with large arrays
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
  }, [walks]);

  // Focus on selected walk
  useEffect(() => {
    if (selectedWalk && mapRef.current) {
      const coords = selectedWalk.coordinates;
      if (coords.length > 0) {
        // Use reduce instead of spread to avoid call stack overflow with large arrays
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
