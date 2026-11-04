import { Suspense } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLinks } from "./nav-links";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" className="hidden font-semibold sm:block">
            Sheet2Dash
          </Link>
          <NavLinks />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Suspense fallback={<div className="size-7" />}>
            <UserButton />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
