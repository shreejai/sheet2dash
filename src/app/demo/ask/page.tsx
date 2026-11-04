import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { todayIso } from "@/lib/dates";
import { DemoAsk } from "./demo-ask";

export const metadata: Metadata = {
  title: "Ask · Demo · Sheet2Dash",
};

export default function DemoAskPage() {
  return (
    <Suspense>
      <Ask />
    </Suspense>
  );
}

async function Ask() {
  await connection();
  return <DemoAsk today={todayIso()} />;
}
