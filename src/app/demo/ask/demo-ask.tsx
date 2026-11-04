"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/rich-text";
import { DEMO_QUESTIONS, demoAnswer, type DemoQuestion } from "@/lib/demo-answers";
import { demoOrders } from "@/lib/demo-data";

/**
 * Ask, in the demo: the same conversation view, but only the suggested
 * questions, answered instantly from the sample orders (no AI call).
 */
export function DemoAsk({ today }: { today: string }) {
  const { orders, unpriced } = useMemo(() => demoOrders(today), [today]);
  const [asked, setAsked] = useState<DemoQuestion[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!asked.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottom.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [asked]);

  const remaining = DEMO_QUESTIONS.filter((q) => !asked.includes(q));

  return (
    <div className="flex min-h-[calc(100dvh-var(--tabbar)-6rem)] flex-col gap-4">
      <div className="flex flex-1 flex-col gap-5" aria-live="polite">
        <div className="flex flex-col gap-1 pt-6">
          <h1 className="large-title">Ask</h1>
          <p className="text-sm text-muted-foreground">
            Ask about the orders in plain English. In the demo, pick a question below; the answers
            are worked out from the sample orders, so they match the dashboard.
          </p>
        </div>

        {asked.map((q) => (
          <div key={q} className="flex flex-col gap-2">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-[#0071e3] px-3.5 py-2 text-base whitespace-pre-wrap text-white sm:text-sm">
                {q}
              </p>
            </div>
            <div className="flex max-w-[92%] flex-col items-start gap-2">
              <span className="flex w-fit items-center gap-1.5 rounded-full bg-fill px-2.5 py-0.5 text-xs text-muted-foreground">
                <Calculator className="size-3.5" aria-hidden />
                Calculated from the sample sheet
              </span>
              <p className="rounded-[1.25rem] rounded-bl-md bg-card px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap sm:text-sm">
                <RichText text={demoAnswer(q, orders, unpriced, today)} />
              </p>
            </div>
          </div>
        ))}

        {remaining.length > 0 && (
          <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
            {remaining.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAsked((a) => [...a, q])}
                className="pressable min-h-11 rounded-2xl bg-card px-4 py-3 text-left text-sm hover:bg-[color-mix(in_srgb,var(--card),var(--foreground)_4%)] contrast-more:ring-1 contrast-more:ring-border"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-(--tabbar) -mx-4 -mb-[calc(var(--tabbar)+1.5rem)] flex flex-wrap items-center justify-between gap-2 bg-background/85 px-4 pt-2 pb-3 backdrop-blur-xl sm:pb-4">
        <p className="text-xs text-muted-foreground">
          Sign in to ask your own questions about your own sheet.
        </p>
        <Button
          size="sm"
          variant="secondary"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          Use your own sheet
        </Button>
      </div>
    </div>
  );
}
