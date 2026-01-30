"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { Walk, WalkStats, PickedWalk } from "./types";
import { fetchAndParseGPX, parseGPXFiles } from "./gpx-parser";
import { calculateWalkStats } from "./utils";

interface WalksContextType {
  walks: Walk[];
  stats: WalkStats;
  isLoading: boolean;
  selectedWalk: Walk | null;
  overlappingWalks: Walk[];
  overlayPosition: { x: number; y: number } | null;
  selectWalk: (walk: Walk | null) => void;
  handleWalkClick: (picked: PickedWalk[]) => void;
  handleOverlapSelect: (walk: Walk) => void;
  closeOverlay: () => void;
  addWalks: (files: File[]) => Promise<void>;
  refreshWalks: () => Promise<void>;
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
  const [walks, setWalks] = useState<Walk[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWalk, setSelectedWalk] = useState<Walk | null>(null);
  const [overlappingWalks, setOverlappingWalks] = useState<Walk[]>([]);
  const [overlayPosition, setOverlayPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const stats = calculateWalkStats(walks);

  // Load GPX files from public directory on mount
  const refreshWalks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/gpx");
      const data = await response.json();

      if (data.files && data.files.length > 0) {
        const parsedWalks = await fetchAndParseGPX(data.files);
        setWalks(parsedWalks);
      }
    } catch (error) {
      console.error("Error loading GPX files:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWalks();
  }, [refreshWalks]);

  const selectWalk = useCallback((walk: Walk | null) => {
    setSelectedWalk(walk);
    setOverlappingWalks([]);
    setOverlayPosition(null);
  }, []);

  const handleWalkClick = useCallback((picked: PickedWalk[]) => {
    if (picked.length === 0) {
      return;
    }

    if (picked.length === 1) {
      // Single walk clicked - select it directly
      setSelectedWalk(picked[0].walk);
      setOverlappingWalks([]);
      setOverlayPosition(null);
    } else {
      // Multiple walks overlapping - show selector
      setOverlappingWalks(picked.map((p) => p.walk));
      setOverlayPosition({ x: picked[0].x, y: picked[0].y });
      setSelectedWalk(null);
    }
  }, []);

  const handleOverlapSelect = useCallback((walk: Walk) => {
    setSelectedWalk(walk);
    setOverlappingWalks([]);
    setOverlayPosition(null);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlappingWalks([]);
    setOverlayPosition(null);
  }, []);

  const addWalks = useCallback(async (files: File[]) => {
    const newWalks = await parseGPXFiles(files);
    setWalks((prev) => [...prev, ...newWalks]);
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
        addWalks,
        refreshWalks,
      }}
    >
      {children}
    </WalksContext.Provider>
  );
}
