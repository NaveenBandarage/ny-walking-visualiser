"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Walk } from "@/lib/types";
import {
  formatDistance,
  formatDuration,
  formatDate,
  formatWalkName,
} from "@/lib/utils";

interface RoutePanelProps {
  walk: Walk | null;
  onClose: () => void;
}

export default function RoutePanel({ walk, onClose }: RoutePanelProps) {
  return (
    <AnimatePresence>
      {walk && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute right-4 top-20 md:right-6 md:top-24 z-20 w-72 md:w-80"
        >
          <div className="panel-glass p-4">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
              aria-label="Close panel"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M1 1L11 11M1 11L11 1" />
              </svg>
            </button>

            {/* Walk name */}
            <h2 className="text-base font-medium text-white pr-6 mb-1">
              {formatWalkName(walk.name)}
            </h2>

            {/* Date */}
            <p className="text-xs text-white/50 font-mono mb-4">
              {formatDate(walk.date)}
            </p>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatBox label="Distance" value={formatDistance(walk.distance)} />
              <StatBox label="Duration" value={formatDuration(walk.duration)} />
              {walk.elevationGain !== undefined && walk.elevationGain > 0 && (
                <StatBox
                  label="Elevation ↑"
                  value={`${Math.round(walk.elevationGain)}m`}
                />
              )}
              {walk.elevationLoss !== undefined && walk.elevationLoss > 0 && (
                <StatBox
                  label="Elevation ↓"
                  value={`${Math.round(walk.elevationLoss)}m`}
                />
              )}
            </div>

            {/* Description */}
            {walk.description && (
              <p className="text-sm text-white/60 leading-relaxed">
                {walk.description}
              </p>
            )}

            {/* Route summary or fallback */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-start gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                  style={{
                    backgroundColor: walk.color
                      ? `rgba(${walk.color[0]}, ${walk.color[1]}, ${walk.color[2]}, 1)`
                      : "white",
                  }}
                />
                <span className="text-xs text-white/60 leading-relaxed">
                  {walk.summary || `${walk.coordinates.length} points`}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface StatBoxProps {
  label: string;
  value: string;
}

function StatBox({ label, value }: StatBoxProps) {
  return (
    <div className="bg-white/5 rounded-md p-2">
      <p className="text-sm font-mono text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-white/40 uppercase tracking-wider">
        {label}
      </p>
    </div>
  );
}
