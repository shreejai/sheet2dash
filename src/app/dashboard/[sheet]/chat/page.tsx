import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSheetAccess } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chat } from "./chat";

export const metadata = { title: "Ask · Sheet2Dash" };

export default function ChatPage({ params }: PageProps<"/dashboard/[sheet]/chat">) {
  return (
    <Suspense fallback={null}>
      <ChatSection params={params} />
    </Suspense>
  );
}

async function ChatSection({ params }: Pick<PageProps<"/dashboard/[sheet]/chat">, "params">) {
  const { sheet: sheetId } = await params;
  const access = await getSheetAccess(sheetId);
  if (!access) notFound();

  if (!access.connection.columnMapping) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up your sheet first</CardTitle>
          <CardDescription>
            Confirm your sheet&apos;s columns on the dashboard, then you can ask questions here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<Link href={`/dashboard/${sheetId}`} />}>
            Go to the dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (access.connection.kind !== "orders") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ask is coming for workout sheets</CardTitle>
          <CardDescription>
            Questions about your training will work here soon. For now, see the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<Link href={`/dashboard/${sheetId}`} />}>
            Go to the dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <Chat sheetId={sheetId} dailyLimit={Number(process.env.CHAT_DAILY_LIMIT) || 30} />;
}
