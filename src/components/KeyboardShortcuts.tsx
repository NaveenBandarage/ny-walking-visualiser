"use client";

import { useEffect } from "react";
import { useWalks } from "@/lib/WalksContext";

interface KeyboardShortcutsProps {
  onToggleSearch?: () => void;
  onToggleChat?: () => void;
  isSearchOpen?: boolean;
}

export default function KeyboardShortcuts({
  onToggleSearch,
  onToggleChat,
  isSearchOpen,
}: KeyboardShortcutsProps) {
  const { walks, selectedWalk, selectWalk, closeOverlay } = useWalks();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if search modal is open (it handles its own keys)
      if (isSearchOpen) return;

      // Don't trigger if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // 'T' to toggle search modal
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        onToggleSearch?.();
        return;
      }

      // 'C' to toggle chat panel
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        onToggleChat?.();
        return;
      }

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
  }, [
    walks,
    selectedWalk,
    selectWalk,
    closeOverlay,
    onToggleSearch,
    onToggleChat,
    isSearchOpen,
  ]);

  return null;
}
