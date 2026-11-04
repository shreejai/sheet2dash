import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Sheet2Dash</h1>
      <p className="max-w-md text-muted-foreground">
        Connect your orders Google Sheet and get a live dashboard of revenue, popular cakes,
        regular customers and upcoming pickups.
      </p>
      <Button size="lg" nativeButton={false} render={<Link href="/dashboard" />}>
        Open dashboard
      </Button>
    </main>
  );
}
