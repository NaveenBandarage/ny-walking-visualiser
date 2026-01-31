"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Walk } from "@/lib/types";
import {
  formatDistance,
  formatDuration,
  formatDate,
  formatWalkName,
} from "@/lib/utils";
import ChatPanel from "./ChatPanel";

type TabType = "details" | "chat";

interface RoutePanelProps {
  walk: Walk | null;
  onClose: () => void;
  showChatOnly?: boolean;
  onCloseChatOnly?: () => void;
}

export default function RoutePanel({
  walk,
  onClose,
  showChatOnly = false,
  onCloseChatOnly,
}: RoutePanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("details");

  // Show panel if walk is selected OR if chat-only mode is active
  const showPanel = walk !== null || showChatOnly;

  // In chat-only mode, always show chat tab
  const effectiveTab = showChatOnly && !walk ? "chat" : activeTab;

  return (
    <AnimatePresence>
      {showPanel && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute right-4 top-20 md:right-6 md:top-24 z-20 w-72 md:w-80"
        >
          <div
            className="panel-glass overflow-hidden flex flex-col"
            style={{ maxHeight: "calc(100vh - 120px)" }}
          >
            {/* Tab header */}
            <div className="flex items-center border-b border-white/10">
              <button
                onClick={() => setActiveTab("details")}
                className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                  effectiveTab === "details"
                    ? "text-white bg-white/5"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
                  effectiveTab === "chat"
                    ? "text-white bg-white/5"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                AI Chat
              </button>

              {/* Close button */}
              <button
                onClick={() => {
                  if (showChatOnly && !walk) {
                    onCloseChatOnly?.();
                  } else {
                    onClose();
                  }
                }}
                className="px-3 py-2.5 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
                aria-label="Close panel"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M1 1L11 11M1 11L11 1" />
                </svg>
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AnimatePresence mode="wait">
                {effectiveTab === "details" ? (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="p-4"
                  >
                    {walk ? (
                      <>
                        {/* Walk name */}
                        <h2 className="text-base font-medium text-white mb-1">
                          {formatWalkName(walk.name)}
                        </h2>

                        {/* Date */}
                        <p className="text-xs text-white/50 font-mono mb-4">
                          {formatDate(walk.date)}
                        </p>

                        {/* Stats grid */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <StatBox
                            label="Distance"
                            value={formatDistance(walk.distance)}
                          />
                          <StatBox
                            label="Duration"
                            value={formatDuration(walk.duration)}
                          />
                          {walk.elevationGain !== undefined &&
                            walk.elevationGain > 0 && (
                              <StatBox
                                label="Elevation ↑"
                                value={`${Math.round(walk.elevationGain)}m`}
                              />
                            )}
                          {walk.elevationLoss !== undefined &&
                            walk.elevationLoss > 0 && (
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
                              {walk.summary ||
                                `${walk.coordinates.length} points`}
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-white/40 text-sm">
                          No walk selected
                        </p>
                        <p className="text-white/30 text-xs mt-1">
                          Click a route or press T to search
                        </p>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="chat"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    className="h-80"
                  >
                    <ChatPanel />
                  </motion.div>
                )}
              </AnimatePresence>
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
