"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Walk } from "@/lib/types";
import { formatDate, formatDistance, formatWalkName } from "@/lib/utils";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  walks: Walk[];
  onSelectWalk: (walk: Walk) => void;
}

export default function SearchModal({
  isOpen,
  onClose,
  walks,
  onSelectWalk,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Pre-compute searchable text for each walk (for fast filtering)
  const searchableWalks = useMemo(() => {
    return walks.map((walk) => {
      const dateStr = formatDate(walk.date).toLowerCase();
      const dayOfWeek = walk.date
        .toLocaleDateString("en-US", { weekday: "long" })
        .toLowerCase();
      const monthName = walk.date
        .toLocaleDateString("en-US", { month: "long" })
        .toLowerCase();
      const searchText = [
        walk.name.toLowerCase(),
        dateStr,
        dayOfWeek,
        monthName,
        walk.summary?.toLowerCase() || "",
        walk.description?.toLowerCase() || "",
      ].join(" ");

      return { walk, searchText };
    });
  }, [walks]);

  // Filter walks based on query - instant with useMemo
  const filteredWalks = useMemo(() => {
    if (!query.trim()) {
      // Show most recent walks when no query
      return walks
        .slice()
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 10);
    }

    const lowerQuery = query.toLowerCase().trim();
    const terms = lowerQuery.split(/\s+/);

    return searchableWalks
      .filter(({ searchText }) =>
        terms.every((term) => searchText.includes(term)),
      )
      .map(({ walk }) => walk)
      .slice(0, 10);
  }, [query, walks, searchableWalks]);

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredWalks]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      // Small delay to ensure modal is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredWalks.length > 0) {
      const selectedElement = listRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [selectedIndex, filteredWalks.length]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredWalks.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredWalks[selectedIndex]) {
            onSelectWalk(filteredWalks[selectedIndex]);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredWalks, selectedIndex, onSelectWalk, onClose],
  );

  const handleSelectWalk = useCallback(
    (walk: Walk) => {
      onSelectWalk(walk);
      onClose();
    },
    [onSelectWalk, onClose],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md"
          >
            <div className="panel-glass overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-white/60 text-sm">🚶</span>
                  <span className="text-white text-sm font-medium">
                    Find walk
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="text-white/40 hover:text-white/80 transition-colors text-xs"
                >
                  ESC
                </button>
              </div>

              {/* Search input */}
              <div className="px-4 py-3 border-b border-white/10">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search by name, date, or day..."
                  className="w-full bg-transparent text-white placeholder-white/40 outline-none text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Results list */}
              <div ref={listRef} className="max-h-64 overflow-y-auto">
                {filteredWalks.length > 0 ? (
                  filteredWalks.map((walk, index) => (
                    <button
                      key={walk.id}
                      onClick={() => handleSelectWalk(walk)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 transition-colors ${
                        index === selectedIndex
                          ? "bg-white/10"
                          : "hover:bg-white/5"
                      }`}
                    >
                      {/* Color indicator */}
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: walk.color
                            ? `rgba(${walk.color[0]}, ${walk.color[1]}, ${walk.color[2]}, 1)`
                            : "white",
                        }}
                      />

                      {/* Walk info */}
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-white text-sm truncate">
                          {formatWalkName(walk.name)}
                        </div>
                        <div className="text-white/40 text-xs">
                          {formatDate(walk.date)} ·{" "}
                          {formatDistance(walk.distance)}
                        </div>
                      </div>

                      {/* Enter hint for selected */}
                      {index === selectedIndex && (
                        <span className="text-white/30 text-xs">↵</span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-white/40 text-sm">
                    No walks found
                  </div>
                )}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-2 border-t border-white/10 bg-white/5">
                <p className="text-white/30 text-xs">
                  Try &quot;Saturday&quot; or &quot;August&quot; or
                  &quot;longest&quot;
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
