"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addDays, daysBetween, startOfWeek } from "@/lib/dates";
import { formatAud, formatCount, formatTime } from "@/lib/format";
import type { UpcomingDay, UpcomingOrder } from "@/lib/metrics";

/*
 * Upcoming pickups in Calendar's list style: a swipeable week strip as an
 * overview (dots mark days with pickups; tapping one scrolls to it), then
 * every day that has pickups, one below the other, its orders shown as
 * Calendar events in pickup-time order.
 */

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const monthYear = new Intl.DateTimeFormat("en-AU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const fullDate = new Intl.DateTimeFormat("en-AU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const weekday = new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function plural(n: number, word: string) {
  return `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
}

function daySummary(day: UpcomingDay) {
  const unpriced = day.orders.filter((o) => o.amount === null).length;
  return [
    plural(day.orders.length, "order"),
    day.total > 0 ? formatAud(day.total) : null,
    unpriced ? `${unpriced} without a price` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const sectionId = (date: string) => `pickups-${date}`;

export function UpcomingCalendar({
  days,
  today,
  windowDays = 14,
}: {
  days: UpcomingDay[];
  today: string;
  /** How many days ahead, from today (an option in Edit). */
  windowDays?: number;
}) {
  const counts = new Map(days.map((d) => [d.date, d.orders.length]));
  const last = addDays(today, windowDays - 1);
  const firstWeek = startOfWeek(today);
  const weeks = Array.from({ length: Math.floor(daysBetween(firstWeek, last) / 7) + 1 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(firstWeek, w * 7 + d)),
  );

  const [week, setWeek] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const total = days.reduce((t, d) => t + d.orders.length, 0);

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function showWeek(index: number) {
    const el = strip.current;
    if (el) {
      el.scrollTo({ left: index * el.clientWidth, behavior: reduceMotion() ? "auto" : "smooth" });
    }
  }

  function jumpTo(date: string) {
    document.getElementById(sectionId(date))?.scrollIntoView({
      behavior: reduceMotion() ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="title-2">{monthYear.format(utc(weeks[week][3]))}</h2>
            <p className="text-xs text-muted-foreground">
              {total
                ? `${plural(total, "pickup")} in the next ${windowDays} days`
                : `No pickups in the next ${windowDays} days`}
            </p>
          </div>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous week"
              disabled={week === 0}
              onClick={() => showWeek(week - 1)}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next week"
              disabled={week === weeks.length - 1}
              onClick={() => showWeek(week + 1)}
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
        </div>

        {/* Week strip: swipe between weeks (native scroll snapping keeps the flick's momentum). */}
        <div
          ref={strip}
          onScroll={(e) => {
            const el = e.currentTarget;
            setWeek(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="-mx-1 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {weeks.map((dates, w) => (
            <div
              key={dates[0]}
              role="group"
              aria-label={`Week of ${fullDate.format(utc(dates[0]))}`}
              className="grid w-full shrink-0 snap-start grid-cols-7 px-1"
              inert={w !== week ? true : undefined}
            >
              {dates.map((date, i) => {
                const inWindow = date >= today && date <= last;
                const count = counts.get(date) ?? 0;
                const isToday = date === today;
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!inWindow || !count}
                    aria-label={`${isToday ? "Today, " : ""}${fullDate.format(utc(date))}, ${
                      count ? plural(count, "pickup") : "no pickups"
                    }`}
                    onClick={() => jumpTo(date)}
                    className={`pressable flex flex-col items-center gap-1 rounded-xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                      inWindow ? "" : "opacity-40"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`text-caption font-medium ${
                        i >= 5 ? "text-muted-foreground" : "text-foreground/70"
                      }`}
                    >
                      {LETTERS[i]}
                    </span>
                    <span
                      aria-hidden
                      className={`flex size-9 items-center justify-center rounded-full text-base tabular-nums pointer-coarse:size-10 ${
                        isToday ? "bg-tint font-semibold text-white" : ""
                      }`}
                    >
                      {Number(date.slice(8))}
                    </span>
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full ${count ? "bg-muted-foreground" : ""}`}
                    />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {days.length ? (
          <ol className="flex flex-col border-t border-separator">
            {days.map((day) => (
              <DaySection key={day.date} day={day} today={today} />
            ))}
          </ol>
        ) : (
          <p className="border-t border-separator py-6 text-center text-sm text-muted-foreground">
            Nothing due in the next {windowDays} days.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DaySection({ day, today }: { day: UpcomingDay; today: string }) {
  const offset = daysBetween(today, day.date);
  const name = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : weekday.format(utc(day.date));
  return (
    <li
      id={sectionId(day.date)}
      // Leave room for the translucent header when jumped to from the strip.
      className="flex scroll-mt-20 flex-col gap-2 pt-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="headline">
          <span className={offset === 0 ? "text-tint" : undefined}>{name}</span>
          <span className="font-normal text-muted-foreground">
            {" "}
            {dayMonth.format(utc(day.date))}
          </span>
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">{daySummary(day)}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {day.orders.map((o, i) => (
          <li key={i} className="grid grid-cols-[4rem_1fr] items-start gap-2">
            <span
              className={`pt-1.5 text-xs tabular-nums ${
                o.pickupMinutes === null ? "text-muted-foreground" : "font-semibold"
              }`}
            >
              {o.pickupMinutes === null ? "Any time" : formatTime(o.pickupMinutes)}
            </span>
            <EventBlock order={o} />
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Calendar's event look: a coloured bar and a light tint of the same colour.
 * Orders without a price use gray and say so in words, so colour is never
 * the only signal.
 */
function EventBlock({ order }: { order: UpcomingOrder }) {
  const priced = order.amount !== null;
  const meta = [order.customer, priced ? formatAud(order.amount!) : "No price"].filter(Boolean);
  return (
    <div
      className={`relative flex min-w-0 flex-col rounded-md py-1.5 pr-2.5 pl-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-md ${
        priced
          ? "bg-[color-mix(in_srgb,var(--tint)_10%,var(--card))] before:bg-tint"
          : "bg-[color-mix(in_srgb,var(--muted-foreground)_10%,var(--card))] before:bg-muted-foreground/60"
      }`}
    >
      <span className="text-sm font-semibold break-words">
        {order.cakeType ?? "No description"}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{meta.join(" · ")}</span>
    </div>
  );
}
