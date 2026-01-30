"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Walk } from "@/lib/types";
import { formatDistance, formatDate } from "@/lib/utils";

interface OverlapSelectorProps {
  walks: Walk[];
  position: { x: number; y: number } | null;
  onSelect: (walk: Walk) => void;
  onClose: () => void;
}

export default function OverlapSelector({
  walks,
  position,
  onSelect,
  onClose,
}: OverlapSelectorProps) {
  const isOpen = walks.length > 1 && position !== null;

  return (
    <AnimatePresence>
      {isOpen && position && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30"
            onClick={onClose}
          />

          {/* Selector popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 5 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed z-40 panel-glass py-1 min-w-[200px] max-w-[280px]"
            style={{
              left: Math.min(position.x, window.innerWidth - 300),
              top: position.y + 10,
            }}
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-white/10">
              <p className="text-xs text-white/50 font-mono">
                {walks.length} overlapping routes
              </p>
            </div>

            {/* Walk list */}
            <div className="max-h-[240px] overflow-y-auto">
              {walks.map((walk, index) => (
                <motion.button
                  key={walk.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onSelect(walk)}
                  className="w-full px-3 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                >
                  {/* Color indicator */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: walk.color
                        ? `rgba(${walk.color[0]}, ${walk.color[1]}, ${walk.color[2]}, 1)`
                        : "white",
                    }}
                  />

                  {/* Walk info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{walk.name}</p>
                    <p className="text-[10px] text-white/40 font-mono">
                      {formatDate(walk.date)} · {formatDistance(walk.distance)}
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-white/30 flex-shrink-0"
                  >
                    <path d="M4 2L8 6L4 10" />
                  </svg>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
