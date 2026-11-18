"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { SheetSummary } from "@/lib/access";

const ADD = "new";

/**
 * Which sheet the dashboard shows. A native select, so phones get the system
 * picker. Keeps the section: switching while on Ask opens the other sheet's Ask.
 */
export function SheetSwitcher({ sheets }: { sheets: SheetSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { sheet } = useParams<{ sheet?: string }>();
  if (!sheets.length) return null;

  const value = pathname === "/dashboard/new" ? ADD : (sheet ?? "");
  const current = sheets.find((s) => s.id === value);
  const onChat = pathname.endsWith("/chat");

  return (
    <label className="pressable relative flex max-w-44 min-w-0 items-center rounded-full bg-fill text-sm font-medium sm:max-w-64">
      <span className="sr-only">Sheet</span>
      <span aria-hidden className="truncate py-1.5 pr-7 pl-3.5">
        {current?.name ?? (value === ADD ? "Add a sheet" : "Choose a sheet")}
      </span>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 size-3.5 opacity-60" />
      {/* Invisible but covering the pill, so the whole pill opens the picker. */}
      <select
        value={value}
        title={current?.name}
        onChange={(e) => {
          const id = e.target.value;
          router.push(id === ADD ? "/dashboard/new" : `/dashboard/${id}${onChat ? "/chat" : ""}`);
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {!current && value !== ADD && <option value="">Choose a sheet</option>}
        {sheets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.role === "viewer" ? `${s.name} (shared with you)` : s.name}
          </option>
        ))}
        <option value={ADD}>Add another sheet…</option>
      </select>
    </label>
  );
}
