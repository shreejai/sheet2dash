import { Suspense } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { listSheets } from "@/lib/access";
import { TabBar, TopNav } from "./nav-links";
import { SheetSwitcher } from "./sheet-switcher";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    // --tabbar: room the phone tab bar takes at the bottom (0 on wider screens).
    <div className="flex flex-1 flex-col [--tabbar:calc(3.0625rem+env(safe-area-inset-bottom))] sm:[--tabbar:0px]">
      {/* Translucent bar: content scrolls under it; a hairline fades in once it does. */}
      <header
        className="material-bar scroll-edge sticky top-0 z-40"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-11 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:h-13">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link href="/dashboard" className="headline pressable shrink-0">
              Sheet2Dash
            </Link>
            <Suspense fallback={null}>
              <Switcher />
            </Suspense>
            <TopNav />
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={<div className="size-7" />}>
              <UserButton />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-[calc(var(--tabbar)+1.5rem)] sm:pt-6">
        {children}
      </main>
      <TabBar />
    </div>
  );
}

async function Switcher() {
  return <SheetSwitcher sheets={await listSheets()} />;
}
