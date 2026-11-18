import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Connection } from "@/lib/access";
import { WEEKDAYS, weekdayIndex } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { getSheet } from "@/lib/google/cached-sheet";
import {
  MUSCLE_GROUPS,
  WORKOUT_GROUP_BY,
  WORKOUT_SORT_BY,
  bodyWeightReadings,
  exerciseHistory,
  listSessions,
  summariseTraining,
} from "@/lib/workout-chat-tools";
import { isCompleteWorkoutMapping, parseWorkouts } from "@/lib/workouts";
import type { ChatSetup } from "./orders-chat";

// The chat setup for a workout sheet: what the model is told, and the tools
// it computes every number with.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const filterSchema = z.object({
  from: isoDate.optional().describe("First session date to include, inclusive"),
  to: isoDate.optional().describe("Last session date to include, inclusive"),
  exercise: z
    .string()
    .optional()
    .describe("Part of an exercise name, case-insensitive, e.g. 'curl' or 'lat pulldown'"),
  muscleGroup: z.enum(MUSCLE_GROUPS).optional().describe("A muscle group the exercise works"),
  dayType: z
    .string()
    .optional()
    .describe("Part of the routine/day type, case-insensitive, e.g. 'push', 'arm'"),
});

export async function workoutChat(connection: Connection, today: string): Promise<ChatSetup> {
  if (connection.kind !== "fitness") return { ok: false, problem: "This isn't a workout sheet." };
  const result = await getSheet(connection.userId, connection.spreadsheetId);
  if (!result.ok) return { ok: false, problem: result.problem };
  const mapping = connection.columnMapping;
  if (!mapping || !isCompleteWorkoutMapping(mapping, result.sheet.headers)) {
    return { ok: false, problem: "Confirm your sheet's columns on the dashboard first." };
  }
  const { entries, bodyWeights } = parseWorkouts(result.sheet.headers, result.sheet.rows, mapping);

  const dates = entries.map((e) => e.date).sort();
  const sessions = new Set(dates).size;
  const dayTypes = [...new Set(entries.map((e) => e.dayType).filter(Boolean))];
  const has = (role: string) => Boolean(mapping[role]);

  const instructions = `You answer questions about "${result.sheet.title}", the user's own workout log, kept in Australia.

Today is ${WEEKDAYS[weekdayIndex(today)]} ${formatDate(today)} (${today}).
The data: ${entries.length} exercise rows over ${sessions} sessions, from ${formatDate(dates[0] ?? today)} to ${formatDate(dates.at(-1) ?? today)}. A session is a day with anything logged.
Each row has a date and an exercise${has("sets") ? ", the number of sets" : ""}${has("reps") ? ", reps (often a range like 10–12)" : ""}${has("load") ? ", a load (kilograms, a cable-stack level, or bodyweight)" : ""}${has("muscle") ? `, target muscles grouped into ${MUSCLE_GROUPS.join(", ")}` : ""}${dayTypes.length ? `, and a routine day type (${dayTypes.join(", ")})` : ""}${has("notes") ? ", sometimes notes" : ""}.${bodyWeights.length ? ` There are also ${bodyWeights.length} body-weight readings.` : ""}

Rules:
- Every number you state must come from a tool result in this conversation. Never estimate, add up or calculate figures yourself; call a tool instead (summarise can group, sort and compare periods for you).
- Work out date ranges from today's date yourself and pass them as YYYY-MM-DD. "This month" or "this year" means up to today; compare them with the same days of the earlier period.
- Cable-stack levels and kilograms are different units: never compare or convert between them. Bodyweight exercises have no load to compare. If a tool says a change isn't comparable, say so.
- Rows logged without a number of sets count as a session, not as sets.
- For an exercise, search by a distinctive part of its name; if nothing matches, the tool lists the exercise names to pick from.
- Write in plain, friendly sentences. Short bullet lists are fine; no tables or headings. Use dates exactly as the tools format them.
- Keep it brief: answer the question, then add one useful observation only if the data supports it.
- You're not a doctor or coach: don't diagnose injuries or prescribe programs. You may point out patterns in the log (e.g. a muscle group trained less often).
- If the log can't answer something (calories, heart rate, anything not in the data), say so plainly.`;

  const tools: ToolSet = {
    summarise: tool({
      description:
        "Sessions, sets and exercises matching a filter. Optionally group by month/week/weekday/exercise/muscleGroup/dayType, and compare with another date range (returns % changes).",
      inputSchema: z.object({
        filter: filterSchema,
        groupBy: z.enum(WORKOUT_GROUP_BY).default("none"),
        sortBy: z
          .enum(WORKOUT_SORT_BY)
          .default("sets")
          .describe("Order of groups; 'chronological' for time series"),
        limit: z.number().int().min(1).max(60).default(12),
        compareTo: z
          .object({ from: isoDate, to: isoDate })
          .optional()
          .describe("Another date range to compare the totals against"),
      }),
      execute: async (input) => summariseTraining(entries, input),
    }),
    exerciseHistory: tool({
      description:
        "Every session of the exercises matching a name (oldest first) with sets, reps, load and notes, plus first, latest and best load and the change. Use for progress and 'when did I last…' questions.",
      inputSchema: z.object({
        exercise: z.string().min(2).describe("Part of the exercise name, case-insensitive"),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.number().int().min(1).max(30).default(12).describe("Most recent sessions shown"),
      }),
      execute: async (input) => exerciseHistory(entries, input),
    }),
    listSessions: tool({
      description:
        "Whole workouts (every exercise logged that day) for sessions matching a filter. Use for 'what did I do on…' or 'my last push day'.",
      inputSchema: z.object({
        filter: filterSchema,
        newestFirst: z.boolean().default(true),
        limit: z.number().int().min(1).max(15).default(5),
      }),
      execute: async (input) => listSessions(entries, input),
    }),
  };
  if (has("bodyWeight")) {
    tools.bodyWeight = tool({
      description: "Body-weight readings in a date range, with the latest, first, lowest, highest and the change.",
      inputSchema: z.object({ from: isoDate, to: isoDate }),
      execute: async (range) => bodyWeightReadings(bodyWeights, range),
    });
  }

  return { ok: true, instructions, tools };
}
