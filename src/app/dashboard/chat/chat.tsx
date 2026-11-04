"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Calculator, ListChecks, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "How did last month compare with the month before?",
  "What are my top 3 flavours this year?",
  "Who are my most loyal customers?",
  "What's due this weekend?",
];

const MAX_CHARS = 1000;

/** Renders **bold** as <strong>; everything else stays plain text (no HTML injection). */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
        chunk.startsWith("**") && chunk.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {chunk.slice(2, -2)}
          </strong>
        ) : (
          chunk
        ),
      )}
    </>
  );
}

const TOOL_LABELS: Record<string, { label: string; Icon: typeof Calculator }> = {
  "tool-aggregate": { label: "Calculated from your sheet", Icon: Calculator },
  "tool-listOrders": { label: "Looked up orders", Icon: ListChecks },
};

export function Chat({ dailyLimit }: { dailyLimit: number }) {
  const { messages, sendMessage, status, error, stop, regenerate } = useChat();
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    sendMessage({ text: question.slice(0, MAX_CHARS) });
    setInput("");
  }

  // Our API answers errors with a short plain-text reason (limit reached, sheet not connected).
  const errorText =
    error && error.message && error.message.length < 200 && !error.message.startsWith("{")
      ? error.message
      : "Something went wrong. Please try again.";

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-4">
      <div className="flex flex-1 flex-col gap-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-4 py-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-tight">Ask about your orders</h1>
              <p className="text-sm text-muted-foreground">
                Answers are worked out from your sheet, so the numbers match the dashboard.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-xl px-3 py-2 text-left text-sm ring-1 ring-foreground/10 transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">
                {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
              </p>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col gap-2">
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
                      <RichText text={part.text} />
                    </p>
                  );
                }
                const tool = TOOL_LABELS[part.type];
                if (!tool) return null;
                return (
                  <span
                    key={i}
                    className="flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    <tool.Icon className="size-3.5" aria-hidden />
                    {tool.label}
                  </span>
                );
              })}
            </div>
          ),
        )}

        {status === "submitted" && (
          <p className="animate-pulse text-sm text-muted-foreground">Looking at your sheet…</p>
        )}

        {error && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{errorText}</span>
            <Button size="sm" variant="ghost" onClick={() => regenerate()}>
              Try again
            </Button>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 flex flex-col gap-1.5 bg-background pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2 rounded-2xl px-3 py-2 ring-1 ring-foreground/15 focus-within:ring-2 focus-within:ring-ring/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={MAX_CHARS}
            placeholder="Ask about revenue, flavours, customers…"
            aria-label="Your question"
            className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          {busy ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => stop()}
              aria-label="Stop"
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon-sm" disabled={!input.trim()} aria-label="Send">
              <ArrowUp />
            </Button>
          )}
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          Your question and the matching orders are sent to OpenAI to write the answer. Up to{" "}
          {dailyLimit} questions a day.
        </p>
      </form>
    </div>
  );
}
