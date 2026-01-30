"use client";

import dynamic from "next/dynamic";
import { WalksProvider, useWalks } from "@/lib/WalksContext";
import Header from "@/components/Header";
import RoutePanel from "@/components/RoutePanel";
import OverlapSelector from "@/components/OverlapSelector";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";

// Dynamic import for Map to avoid SSR issues with Mapbox
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-black flex items-center justify-center">
      <div className="text-white/50 font-mono text-sm">Loading map...</div>
    </div>
  ),
});

function WalkVisualizer() {
  const {
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
  } = useWalks();

  return (
    <main className="h-screen w-screen relative overflow-hidden bg-black">
      {/* Map */}
      <Map
        walks={walks}
        selectedWalk={selectedWalk}
        onWalkClick={handleWalkClick}
        onMapClick={() => selectWalk(null)}
      />

      {/* Header with stats */}
      <Header stats={stats} isLoading={isLoading} />

      {/* Route detail panel */}
      <RoutePanel walk={selectedWalk} onClose={() => selectWalk(null)} />

      {/* Overlap selector popup */}
      <OverlapSelector
        walks={overlappingWalks}
        position={overlayPosition}
        onSelect={handleOverlapSelect}
        onClose={closeOverlay}
      />

      {/* Empty state */}
      {!isLoading && walks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center p-8">
            <p className="text-white/60 mb-2 font-mono">No walks found</p>
            <p className="text-white/40 text-sm mb-2">
              Add GPX files to the{" "}
              <code className="bg-white/10 px-1.5 py-0.5 rounded">
                public/gpx
              </code>{" "}
              folder
            </p>
            <p className="text-white/40 text-sm">
              Then run{" "}
              <code className="bg-white/10 px-1.5 py-0.5 rounded">
                npm run preprocess
              </code>
            </p>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute bottom-4 left-4 z-10">
          <div className="flex items-center gap-2 text-white/50 text-xs font-mono">
            <div className="w-2 h-2 bg-white/50 rounded-full animate-pulse" />
            Loading routes...
          </div>
        </div>
      )}

      {/* Keyboard shortcuts handler */}
      <KeyboardShortcuts />

      {/* Keyboard hint */}
      {walks.length > 0 && !selectedWalk && (
        <div className="absolute bottom-4 right-4 z-10">
          <div className="text-white/30 text-xs font-mono">
            Use arrow keys to navigate
          </div>
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <WalksProvider>
      <WalkVisualizer />
    </WalksProvider>
  );
}
