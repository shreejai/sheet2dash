import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpenLastSheet } from "../open-last-sheet";

// Older links and bookmarks: /dashboard/chat opens Ask for the last-used sheet.
export default function ChatIndex() {
  return (
    <Suspense fallback={null}>
      <OpenLastSheet
        section="/chat"
        fallback={
          <Card>
            <CardHeader>
              <CardTitle>Connect a sheet first</CardTitle>
            </CardHeader>
            <CardContent>
              <Button nativeButton={false} render={<Link href="/dashboard" />}>
                Go to the dashboard
              </Button>
            </CardContent>
          </Card>
        }
      />
    </Suspense>
  );
}
