"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, MessageCircleQuestionMark } from "lucide-react";
import { cn } from "cn";

// The signed-in app and the public demo have the same two sections.
const SECTIONS = {
  app: [
    { href: "/dashboard", label: "Dashboard", Icon: LayoutGrid },
    { href: "/dashboard/chat", label: "Ask", Icon: MessageCircleQuestionMark },
  ],
  demo: [
    { href: "/demo", label: "Dashboard", Icon: LayoutGrid },
    { href: "/demo/ask", label: "Ask", Icon: MessageCircleQuestionMark },
  ],
} as const;

type Area = keyof typeof SECTIONS;

const SHEET_BASE = /^\/dashboard\/[0-9a-f-]{36}/i;

type NavProps = { area: Area; pathname: string | null };

/** The sections' links, pointing into the sheet being viewed (if any). */
function sectionsFor(area: Area, pathname: string | null) {
  const base = area === "app" && pathname ? SHEET_BASE.exec(pathname)?.[0] : undefined;
  return SECTIONS[area].map((s) => (base ? { ...s, href: s.href.replace("/dashboard", base) } : s));
}

/**
 * The URL is only known at request time (it holds the sheet id), so each bar
 * first renders with plain links and no selection, then fills in.
 */
function withPathname(Nav: (props: NavProps) => React.ReactNode) {
  function Current({ area }: { area: Area }) {
    return <Nav area={area} pathname={usePathname()} />;
  }
  return function NavWithPathname({ area = "app" }: { area?: Area }) {
    return (
      <Suspense fallback={<Nav area={area} pathname={null} />}>
        <Current area={area} />
      </Suspense>
    );
  };
}

/** Wide screens: the two sections as capsules in the top bar. */
export const TopNav = withPathname(function TopNav({ area, pathname }: NavProps) {
  const sections = sectionsFor(area, pathname);
  return (
    <nav aria-label="Sections" className="hidden items-center gap-1 sm:flex">
      {sections.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "pressable rounded-full px-3.5 py-1.5 text-sm",
              active
                ? "bg-fill font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
});

/**
 * Phones: a tab bar along the bottom (HIG › Tab bars), always visible, with
 * an icon and a one-word label per section. Each tab fills half the bar, so
 * the targets are far larger than 44 pt.
 */
export const TabBar = withPathname(function TabBar({ area, pathname }: NavProps) {
  const sections = sectionsFor(area, pathname);
  return (
    <nav
      aria-label="Sections"
      className="material-bar fixed inset-x-0 bottom-0 z-40 flex shadow-[0_-0.5px_0_var(--separator)] sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {sections.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "pressable flex h-[3.0625rem] flex-1 flex-col items-center justify-center gap-0.5 text-tab font-medium",
              active ? "text-tint" : "text-muted-foreground",
            )}
          >
            <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
});
