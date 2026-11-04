import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sheetConnections } from "@/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GoogleApiError, fetchMergedSheet, type MergedSheet } from "@/lib/google/sheets";
import { getGoogleToken } from "@/lib/google/token";
import { disconnectSheet } from "./actions";
import { ConnectSheetButton } from "./connect-sheet-button";

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <SheetSection />
    </Suspense>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading your sheet…</CardTitle>
      </CardHeader>
    </Card>
  );
}

async function SheetSection() {
  const { userId } = await auth();
  if (!userId) return null; // the proxy already redirects signed-out users

  const [connection] = await getDb()
    .select()
    .from(sheetConnections)
    .where(eq(sheetConnections.userId, userId));

  if (!connection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect your Google Sheet</CardTitle>
          <CardDescription>
            Pick your orders spreadsheet. The app can only see the file you pick, and never
            changes it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectSheetButton />
        </CardContent>
      </Card>
    );
  }

  const token = await getGoogleToken(userId);
  let sheet: MergedSheet | null = null;
  let problem: string | null = null;
  if (token.status !== "ok") {
    problem = "Google access has expired or is missing. Reconnect to continue.";
  } else {
    try {
      sheet = await fetchMergedSheet(connection.spreadsheetId, token.token);
    } catch (e) {
      if (!(e instanceof GoogleApiError)) throw e;
      problem =
        e.status === 403 || e.status === 404
          ? "This app can't open the sheet any more. Pick it again to restore access."
          : `Google Sheets returned an error: ${e.message}`;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <a
            href={`https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit`}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            {sheet?.title ?? connection.spreadsheetName}
          </a>
        </CardTitle>
        <CardDescription>
          {sheet
            ? `${sheet.rows.length.toLocaleString("en-AU")} orders from ${
                sheet.tabs.filter((t) => t.included).length
              } tab(s)`
            : "Connected sheet"}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {problem && <p className="text-sm text-destructive">{problem}</p>}

        {sheet && (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Tabs</h2>
              <ul className="divide-y rounded-lg border">
                {sheet.tabs.map((tab) => (
                  <li
                    key={tab.title}
                    className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                  >
                    <span className={tab.included ? "" : "text-muted-foreground line-through"}>
                      {tab.title}
                    </span>
                    <span className="text-right text-muted-foreground">
                      {tab.rowCount.toLocaleString("en-AU")} rows
                      {tab.note && <span className="block text-xs">{tab.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Columns found</h2>
              <ul className="flex flex-wrap gap-2">
                {sheet.headers.map((h) => (
                  <li key={h} className="rounded-md bg-muted px-2 py-1 text-xs">
                    {h}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Next step: confirm which column is the due date, amount, cake type and so on.
              </p>
            </section>
          </>
        )}

        <div className="flex flex-wrap items-start gap-2">
          <ConnectSheetButton variant="outline">
            {problem ? "Reconnect sheet" : "Change sheet"}
          </ConnectSheetButton>
          <form action={disconnectSheet}>
            <Button type="submit" variant="ghost">
              Disconnect
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
