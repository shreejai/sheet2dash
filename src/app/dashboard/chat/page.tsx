import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sheetConnections } from "@/db/schema";
import { getAccess } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chat } from "./chat";

export const metadata = { title: "Ask · Sheet2Dash" };

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatSection />
    </Suspense>
  );
}

async function ChatSection() {
  const access = await getAccess();
  if (!access) return null;
  const userId = access.ownerId; // a viewer asks about the shared dashboard

  const [connection] = await getDb()
    .select({ columnMapping: sheetConnections.columnMapping })
    .from(sheetConnections)
    .where(eq(sheetConnections.userId, userId));

  if (!connection?.columnMapping) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up your sheet first</CardTitle>
          <CardDescription>
            Connect your orders sheet and confirm its columns, then you can ask questions here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<Link href="/dashboard" />}>
            Go to the dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <Chat dailyLimit={Number(process.env.CHAT_DAILY_LIMIT) || 30} />;
}
