"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Calculator, ListChecks, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/rich-text";

const SUGGESTIONS = [
  "How did last month compare with the month before?",
  "What are my top 3 flavours this year?",
  "Who are my most loyal customers?",
  "What's due this weekend?",
];

const MAX_CHARS = 1000;

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
    <div className="flex min-h-[calc(100dvh-var(--tabbar)-6rem)] flex-col gap-4">
      <div className="flex flex-1 flex-col gap-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-4 py-6">
            <div className="flex flex-col gap-1">
              <h1 className="large-title">Ask</h1>
              <p className="text-sm text-muted-foreground">
                Ask anything about your orders. Answers are worked out from your sheet, so the
                numbers match the dashboard.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="pressable min-h-11 rounded-2xl bg-card px-4 py-3 text-left text-sm hover:bg-[color-mix(in_srgb,var(--card),var(--foreground)_4%)] contrast-more:ring-1 contrast-more:ring-border"
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
              <p className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-[#0071e3] px-3.5 py-2 text-base whitespace-pre-wrap text-white sm:text-sm">
                {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
              </p>
            </div>
          ) : (
            <div key={m.id} className="flex max-w-[92%] flex-col items-start gap-2">
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p
                      key={i}
                      className="rounded-[1.25rem] rounded-bl-md bg-card px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap sm:text-sm"
                    >
                      <RichText text={part.text} />
                    </p>
                  );
                }
                const tool = TOOL_LABELS[part.type];
                if (!tool) return null;
                return (
                  <span
                    key={i}
                    className="flex w-fit items-center gap-1.5 rounded-full bg-fill px-2.5 py-0.5 text-xs text-muted-foreground"
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
          <p className="text-sm text-muted-foreground motion-safe:animate-pulse">
            Looking at your sheet…
          </p>
        )}

        {error && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-4 py-2 text-sm text-destructive">
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
        className="sticky bottom-(--tabbar) -mx-4 -mb-[calc(var(--tabbar)+1.5rem)] flex flex-col gap-1.5 bg-background/85 px-4 pt-2 pb-3 backdrop-blur-xl sm:pb-4"
      >
        <div className="flex items-end gap-2 rounded-[1.375rem] bg-card py-1.5 pr-1.5 pl-4 ring-1 ring-separator focus-within:ring-2 focus-within:ring-ring/50">
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
            className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none self-center bg-transparent py-1 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          {busy ? (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
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
