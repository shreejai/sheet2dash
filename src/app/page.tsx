import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <h1 className="large-title sm:text-5xl sm:leading-[1.08]">Sheet2Dash</h1>
      <p className="max-w-md text-base text-muted-foreground">
        Connect your orders Google Sheet and get a live dashboard of revenue, popular cakes, regular
        customers and upcoming pickups.
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button size="lg" nativeButton={false} render={<Link href="/dashboard" />}>
          Open dashboard
        </Button>
        <Button size="lg" variant="secondary" nativeButton={false} render={<Link href="/demo" />}>
          Try the demo
        </Button>
      </div>
      <Link href="/privacy" className="mt-6 text-xs text-muted-foreground hover:text-foreground">
        Privacy
      </Link>
    </main>
  );
}
