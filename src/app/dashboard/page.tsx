import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectSheetButton } from "./connect-sheet-button";
import { OpenLastSheet } from "./open-last-sheet";

export default function DashboardIndex() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <OpenLastSheet fallback={<ConnectFirstSheet />} />
    </Suspense>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading your sheets…</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ConnectFirstSheet() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your Google Sheet</CardTitle>
        <CardDescription>
          Pick your orders spreadsheet. The app can only see the file you pick, and never changes
          it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConnectSheetButton />
      </CardContent>
    </Card>
  );
}
