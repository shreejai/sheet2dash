import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sheetConnections } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chat } from "./chat";

export const metadata = { title: "Ask · Sheet2Dashboard" };

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatSection />
    </Suspense>
  );
}

async function ChatSection() {
  const { userId } = await auth();
  if (!userId) return null;

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
