"use client";

import { useRef } from "react";
import { cn } from "cn";

/**
 * Apple's segmented control (HIG › Segmented controls): equal-width segments
 * on a gray track, the selected one on a raised white "thumb". The thumb is a
 * single element that slides, so a quick second tap retargets it from where
 * it is on screen rather than jumping. Arrow keys move the selection, as with
 * any radio group.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "relative grid h-8 auto-cols-fr grid-flow-col rounded-[9px] bg-fill p-0.5 pointer-coarse:h-11 pointer-coarse:rounded-[11px]",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-[7px] bg-card shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none pointer-coarse:rounded-[9px] dark:bg-[#636366]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o, i) => {
        const selected = i === index;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 min-w-0 truncate rounded-[7px] px-2 text-[0.8125rem] whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [-webkit-tap-highlight-color:transparent]",
              selected ? "font-semibold text-foreground" : "font-medium text-foreground/80",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
