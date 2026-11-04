"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIMEZONE } from "@/lib/dates";
import { refreshSheet } from "./actions";

const POLL_MS = 60_000;

const clock = new Intl.DateTimeFormat("en-AU", {
  timeZone: TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Keeps the dashboard live: re-renders it from the server every minute while
 * the tab is visible (the server caches the sheet for ~30s), and offers a
 * manual refresh that bypasses the cache. The page stays on screen while it
 * reloads; a manual refresh dims it slightly so the click visibly registers.
 */
export function LiveRegion({
  fetchedAt,
  header,
  children,
}: {
  /** When the server last read the sheet from Google (ms since epoch). */
  fetchedAt: number;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [polling, startPoll] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const lastPoll = useRef(0);

  useEffect(() => {
    lastPoll.current = Date.now();
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      lastPoll.current = Date.now();
      startPoll(() => router.refresh());
    };
    const timer = setInterval(poll, POLL_MS);
    // Coming back to the tab after a while: catch up straight away.
    const onVisible = () => {
      if (Date.now() - lastPoll.current >= POLL_MS) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const busy = polling || refreshing;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-1">
        {header}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-live="polite">
            {busy ? "Checking the sheet…" : `Updated ${clock.format(fetchedAt)}`}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => startRefresh(() => refreshSheet())}
            disabled={refreshing}
            aria-label="Refresh from Google Sheets"
          >
            <RefreshCw
              className={refreshing ? "motion-safe:animate-spin" : undefined}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </div>
      <div
        className={`flex flex-col gap-4 transition-opacity duration-200 ${refreshing ? "opacity-60" : ""}`}
        aria-busy={busy}
      >
        {children}
      </div>
    </>
  );
}
