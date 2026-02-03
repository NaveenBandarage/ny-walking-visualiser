import { Walk } from "./types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WalkDataSummary {
  stats: {
    totalWalks: number;
    totalDistanceKm: number;
    totalDurationHours: number;
    averageDistanceKm: number;
    averageDurationMin: number;
  };
  byDayOfWeek: Record<string, number>;
  byMonth: Record<string, number>;
  byTimeOfDay: {
    morning: number; // 5am-12pm
    afternoon: number; // 12pm-5pm
    evening: number; // 5pm-9pm
    night: number; // 9pm-5am
  };
  topAreas: { name: string; count: number }[];
  totalWithArea: number;
  totalWithoutArea: number;
  walks: {
    date: string;
    day: string;
    timeOfDay: string;
    distanceKm: number;
    durationMin: number;
    elevationGainM?: number;
    areaName?: string;
  }[];
}

function getTimeOfDay(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Prepare walk data for chat context - creates a compact summary
 * Typically ~2KB for 100 walks
 */
export function prepareWalkDataForChat(walks: Walk[]): WalkDataSummary {
  const totalDistance = walks.reduce((sum, w) => sum + w.distance, 0);
  const totalDuration = walks.reduce((sum, w) => sum + w.duration, 0);

  const byDayOfWeek: Record<string, number> = {
    Sunday: 0,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
  };

  const byMonth: Record<string, number> = {};
  const byTimeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const byArea: Record<string, number> = {};
  let totalWithArea = 0;
  let totalWithoutArea = 0;

  const walkDetails = walks.map((walk) => {
    const day = walk.date.toLocaleDateString("en-US", { weekday: "long" });
    const month = walk.date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const timeOfDay = getTimeOfDay(walk.date);
    const areaName = walk.areaName || walk.neighborhood || walk.borough;

    byDayOfWeek[day] = (byDayOfWeek[day] || 0) + 1;
    byMonth[month] = (byMonth[month] || 0) + 1;
    byTimeOfDay[timeOfDay as keyof typeof byTimeOfDay]++;
    if (areaName) {
      byArea[areaName] = (byArea[areaName] || 0) + 1;
      totalWithArea++;
    } else {
      totalWithoutArea++;
    }

    return {
      date: walk.date.toISOString().split("T")[0],
      day,
      timeOfDay,
      distanceKm: Math.round(walk.distance * 100) / 100,
      durationMin: Math.round(walk.duration),
      elevationGainM: walk.elevationGain
        ? Math.round(walk.elevationGain)
        : undefined,
      areaName: areaName || undefined,
    };
  });

  const topAreas = Object.entries(byArea)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  return {
    stats: {
      totalWalks: walks.length,
      totalDistanceKm: Math.round(totalDistance * 100) / 100,
      totalDurationHours: Math.round((totalDuration / 60) * 100) / 100,
      averageDistanceKm:
        walks.length > 0
          ? Math.round((totalDistance / walks.length) * 100) / 100
          : 0,
      averageDurationMin:
        walks.length > 0 ? Math.round(totalDuration / walks.length) : 0,
    },
    byDayOfWeek,
    byMonth,
    byTimeOfDay,
    topAreas,
    totalWithArea,
    totalWithoutArea,
    walks: walkDetails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    ),
  };
}

/**
 * Build system prompt for Ollama with walk data context
 */
export function buildChatSystemPrompt(
  walkData: WalkDataSummary,
  retrievedContext?: string,
): string {
  return `You are a helpful assistant that answers questions about the user's walking history. You have access to their complete walking data.

IMPORTANT INSTRUCTIONS:
- Answer questions directly and concisely
- Use the data provided to give accurate answers
- When asked about counts, distances, or durations, calculate from the data
- Use WALKING DATA SUMMARY for aggregates and overall trends
- Use RETRIEVED WALKS for specific, walk-level questions
- If a question requires neighborhood or area names and they are not in the data, say so and ask a follow-up question
- Format numbers nicely (e.g., "3.2 km" not "3.234523 km")
- Be conversational but brief

WALKING DATA SUMMARY:
- Total walks: ${walkData.stats.totalWalks}
- Total distance: ${walkData.stats.totalDistanceKm} km
- Total duration: ${walkData.stats.totalDurationHours} hours
- Average walk: ${walkData.stats.averageDistanceKm} km, ${walkData.stats.averageDurationMin} min

WALKS BY DAY OF WEEK:
${Object.entries(walkData.byDayOfWeek)
  .map(([day, count]) => `- ${day}: ${count}`)
  .join("\n")}

WALKS BY TIME OF DAY:
- Morning (5am-12pm): ${walkData.byTimeOfDay.morning}
- Afternoon (12pm-5pm): ${walkData.byTimeOfDay.afternoon}
- Evening (5pm-9pm): ${walkData.byTimeOfDay.evening}
- Night (9pm-5am): ${walkData.byTimeOfDay.night}

WALKS BY AREA (top 12):
${walkData.topAreas.length > 0
  ? walkData.topAreas
      .map((area) => `- ${area.name}: ${area.count}`)
      .join("\n")
  : "- (none)"}
${walkData.totalWithoutArea > 0 ? `\n- Unknown area: ${walkData.totalWithoutArea}` : ""}

WALKS BY MONTH:
${Object.entries(walkData.byMonth)
  .map(([month, count]) => `- ${month}: ${count}`)
  .join("\n")}

RETRIEVED WALKS (semantic matches):
${retrievedContext?.trim() ? retrievedContext : "- (none)"}

RECENT WALKS (most recent first):
${walkData.walks
  .slice(0, 20) // Limit to most recent 20 to keep context manageable
  .map(
    (w) =>
      `- ${w.date} (${w.day}, ${w.timeOfDay}${w.areaName ? `, ${w.areaName}` : ""}): ${w.distanceKm}km, ${w.durationMin}min${w.elevationGainM ? `, +${w.elevationGainM}m elevation` : ""}`,
  )
  .join("\n")}
${walkData.walks.length > 20 ? `\n... and ${walkData.walks.length - 20} more walks` : ""}`;
}

/**
 * Example questions to suggest to users
 */
export const SUGGESTED_QUESTIONS = [
  "How many walks have I done on Saturday?",
  "Which area of NYC do I walk in most?",
  "What was my longest walk?",
  "When do I walk the most - morning or evening?",
  "How many km did I walk this month?",
  "What's my most active day of the week?",
];
