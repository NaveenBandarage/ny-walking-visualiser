"use client";

import { motion } from "framer-motion";
import { WalkStats } from "@/lib/types";
import { formatDistance, formatDuration } from "@/lib/utils";

interface HeaderProps {
  stats: WalkStats;
  isLoading?: boolean;
}

export default function Header({ stats, isLoading }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
    >
      <div className="flex items-center justify-between p-4 md:p-6">
        {/* Title */}
        <div className="pointer-events-auto">
          <h1 className="text-lg md:text-xl font-mono font-medium tracking-tight text-white">
            nyc walks
          </h1>
          <p className="text-xs text-white/50 font-mono">
            walking routes visualizer
          </p>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-4 md:gap-6 pointer-events-auto"
        >
          <Stat
            label="walks"
            value={isLoading ? "--" : stats.totalWalks.toString()}
          />
          <Stat
            label="distance"
            value={isLoading ? "--" : formatDistance(stats.totalDistance)}
          />
          <Stat
            label="time"
            value={isLoading ? "--" : formatDuration(stats.totalDuration)}
            className="hidden sm:flex"
          />
        </motion.div>
      </div>
    </motion.header>
  );
}

interface StatProps {
  label: string;
  value: string;
  className?: string;
}

function Stat({ label, value, className = "" }: StatProps) {
  return (
    <div className={`flex flex-col items-end ${className}`}>
      <span className="text-sm md:text-base font-mono text-white tabular-nums">
        {value}
      </span>
      <span className="text-[10px] md:text-xs text-white/40 font-mono uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
