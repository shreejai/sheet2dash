import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { chatUsage } from "@/db/schema";
import { todayIso } from "@/lib/dates";
import { getSheetAccess } from "@/lib/access";
import { ordersChat } from "@/lib/chat/orders-chat";
import { workoutChat } from "@/lib/chat/workout-chat";

const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-nano";
const DAILY_LIMIT = Number(process.env.CHAT_DAILY_LIMIT) || 30;
const MAX_HISTORY = 12;
const MAX_QUESTION_CHARS = 1000;

const text = (m: UIMessage) =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    messages?: unknown;
    sheetId?: unknown;
  } | null;
  const access = await getSheetAccess(body?.sheetId);
  if (!access) return new Response("Please sign in again.", { status: 401 });
  // Questions count against the person asking; the data is the sheet they're viewing.
  const { userId, connection } = access;

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

  const setup =
    connection.kind === "fitness"
      ? await workoutChat(connection, today)
      : await ordersChat(connection, today);
  if (!setup.ok) return new Response(setup.problem, { status: 409 });

  const result = streamText({
    model: openai(MODEL),
    instructions: setup.instructions,
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
    tools: setup.tools,
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
