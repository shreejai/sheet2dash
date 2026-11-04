import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  tool,
  type UIMessage,
} from "ai";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { chatUsage } from "@/db/schema";
import { GROUP_BY, SORT_BY, aggregate, listOrders } from "@/lib/chat-tools";
import { WEEKDAYS, todayIso, weekdayIndex } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { getAccess } from "@/lib/access";
import { loadOrders } from "@/lib/load-orders";

const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-nano";
const DAILY_LIMIT = Number(process.env.CHAT_DAILY_LIMIT) || 30;
const MAX_HISTORY = 12;
const MAX_QUESTION_CHARS = 1000;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const filterSchema = z.object({
  from: isoDate.optional().describe("First due date to include, inclusive"),
  to: isoDate.optional().describe("Last due date to include, inclusive"),
  flavour: z.string().optional().describe("Exact flavour group name, e.g. Rasmalai"),
  customer: z.string().optional().describe("Part of a customer's name, case-insensitive"),
  descriptionContains: z
    .string()
    .optional()
    .describe("Text to look for in the cake description, e.g. cupcakes, fondant"),
});

const text = (m: UIMessage) =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();

export async function POST(req: Request) {
  const access = await getAccess();
  if (!access) return new Response("Please sign in again.", { status: 401 });
  // Questions count against the person asking; the data is the dashboard they can see.
  const { userId, ownerId } = access;

  const body = (await req.json().catch(() => null)) as { messages?: unknown } | null;
  const validated = await safeValidateUIMessages({ messages: body?.messages });
  if (!validated.success) return new Response("That message couldn't be read.", { status: 400 });

  // Only the text of earlier turns goes back to the model. Tool results always
  // come from this server, never from the browser's copy of the conversation.
  const history = validated.data
    .slice(-MAX_HISTORY)
    .map((m) => ({ id: m.id, role: m.role, text: text(m) }))
    .filter((m) => m.role !== "system" && m.text);
  const question = history.at(-1);
  if (question?.role !== "user") return new Response("Ask a question first.", { status: 400 });
  if (question.text.length > MAX_QUESTION_CHARS) {
    return new Response(`Please keep questions under ${MAX_QUESTION_CHARS} characters.`, {
      status: 400,
    });
  }

  // Daily cap, counted per user per business day.
  const today = todayIso();
  const [usage] = await getDb()
    .insert(chatUsage)
    .values({ userId, day: today, count: 1 })
    .onConflictDoUpdate({
      target: [chatUsage.userId, chatUsage.day],
      set: { count: sql`${chatUsage.count} + 1` },
    })
    .returning({ count: chatUsage.count });
  if (usage.count > DAILY_LIMIT) {
    return new Response(
      `You've asked ${DAILY_LIMIT} questions today, which is the daily limit. It resets at midnight.`,
      { status: 429 },
    );
  }

  const data = await loadOrders(ownerId);
  if (!data.ok) return new Response(data.problem, { status: 409 });
  const { orders, unpriced } = data;

  const dates = orders.map((o) => o.dueDate).sort();
  const instructions = `You answer questions about "${data.title}", a small cake business in Australia, using its order sheet.

Today is ${WEEKDAYS[weekdayIndex(today)]} ${formatDate(today)} (${today}).
The data: ${orders.length} priced orders with due dates from ${formatDate(dates[0] ?? today)} to ${formatDate(dates.at(-1) ?? today)}, plus ${unpriced.length} orders with no price filled in yet (listOrders shows them; they never count as revenue).
Each order has a due date (when it's picked up)${data.hasColumn("pickupTime") ? ", sometimes a pickup time" : ""}, an amount charged in AUD${data.hasColumn("cakeType") ? ", a free-text cake description grouped into flavours (Rasmalai, Chocolate, White chocolate, Vanilla, Red velvet, Black forest, Biscoff, Butterscotch, Pistachio, Caramel, Raspberry, Strawberry, Mango, Passion fruit, Lemon, Coffee, Other)" : ""}${data.hasColumn("customer") ? " and a customer name" : ""}.

Rules:
- Every number you state must come from a tool result in this conversation. Never estimate, add up or calculate figures yourself; call a tool instead (aggregate can group, sort and compare periods for you).
- Work out date ranges from today's date yourself and pass them as YYYY-MM-DD. "This month" or "this year" means up to today; compare them with the same days of the earlier period.
- "Revenue" means the sum of amounts charged. Dates are due dates.
- Write in plain, friendly sentences. Short bullet lists are fine; no tables or headings. Use A$ amounts and DD/MM/YYYY dates exactly as the tools format them.
- Keep it brief: answer the question, then add one useful observation only if the data supports it.
- If the sheet can't answer something (costs, profit, anything not in the data), say so plainly.`;

  const result = streamText({
    model: openai(MODEL),
    instructions,
    messages: await convertToModelMessages(
      history.map(({ id, role, text }): UIMessage => ({
        id,
        role,
        parts: [{ type: "text", text }],
      })),
    ),
    reasoning: "low",
    maxOutputTokens: 2000,
    stopWhen: isStepCount(6),
    tools: {
      aggregate: tool({
        description:
          "Totals (orders, revenue, average order) of priced orders matching a filter. Optionally group by period/flavour/customer, and compare with another date range (returns % changes).",
        inputSchema: z.object({
          filter: filterSchema,
          groupBy: z.enum(GROUP_BY).default("none"),
          sortBy: z
            .enum(SORT_BY)
            .default("revenue")
            .describe("Order of groups; 'chronological' for time series"),
          limit: z.number().int().min(1).max(60).default(12),
          compareTo: z
            .object({ from: isoDate, to: isoDate })
            .optional()
            .describe("Another date range to compare the totals against"),
        }),
        execute: async (input) => aggregate(orders, input),
      }),
      listOrders: tool({
        description:
          "Individual orders matching a filter, including orders without a price yet. Use for what's due when, or details of specific orders.",
        inputSchema: z.object({
          filter: filterSchema,
          newestFirst: z.boolean().default(false),
          limit: z.number().int().min(1).max(30).default(15),
        }),
        execute: async (input) => listOrders([...orders, ...unpriced], input),
      }),
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error("chat error", error);
        return "Sorry, something went wrong answering that. Please try again.";
      },
    }),
  });
}
