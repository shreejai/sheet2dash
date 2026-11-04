import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { todayIso } from "@/lib/dates";
import { DemoDashboard } from "./demo-dashboard";

export const metadata: Metadata = {
  title: "Demo · Sheet2Dash",
  description: "Sheet2Dash running on sample orders from a made-up cake shop.",
};

export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Loading the demo…</CardTitle>
          </CardHeader>
        </Card>
      }
    >
      <Demo />
    </Suspense>
  );
}

async function Demo() {
  // The sample orders are anchored to today, so this renders per request.
  await connection();
  return <DemoDashboard today={todayIso()} />;
}
