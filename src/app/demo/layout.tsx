import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TabBar, TopNav } from "../dashboard/nav-links";

/** The public demo: the app's own layout, marked as a demo, with a way in. */
export default function DemoLayout({ children }: LayoutProps<"/demo">) {
  return (
    <div className="flex flex-1 flex-col [--tabbar:calc(3.0625rem+env(safe-area-inset-bottom))] sm:[--tabbar:0px]">
      <header
        className="material-bar scroll-edge sticky top-0 z-40"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-11 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:h-13">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="headline pressable flex items-center gap-2">
              Sheet2Dash
              <span className="rounded-full bg-fill px-2 py-0.5 text-caption font-semibold text-muted-foreground">
                Demo
              </span>
            </Link>
            <TopNav area="demo" />
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
              <span className="sm:hidden">Sign in</span>
              <span className="hidden sm:inline">Use your own sheet</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-[calc(var(--tabbar)+1.5rem)] sm:pt-6">
        {children}
      </main>
      <TabBar area="demo" />
    </div>
  );
}
