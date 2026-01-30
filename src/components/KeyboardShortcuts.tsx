"use client";

import { useEffect } from "react";
import { useWalks } from "@/lib/WalksContext";

export default function KeyboardShortcuts() {
  const { walks, selectedWalk, selectWalk, closeOverlay } = useWalks();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to deselect
      if (e.key === "Escape") {
        selectWalk(null);
        closeOverlay();
        return;
      }

      // Arrow keys to navigate between walks
      if (walks.length === 0) return;

      const currentIndex = selectedWalk
        ? walks.findIndex((w) => w.id === selectedWalk.id)
        : -1;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex =
          currentIndex < walks.length - 1 ? currentIndex + 1 : 0;
        selectWalk(walks[nextIndex]);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex =
          currentIndex > 0 ? currentIndex - 1 : walks.length - 1;
        selectWalk(walks[prevIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [walks, selectedWalk, selectWalk, closeOverlay]);

  return null;
}
