import { Suspense } from "react";
import Link from "next/link";
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
import { formatAud, formatCount, formatDate } from "@/lib/format";
import { GoogleApiError, fetchMergedSheet, type MergedSheet } from "@/lib/google/sheets";
import { getGoogleToken } from "@/lib/google/token";
import { ROLES, ROLE_KEYS, detectColumns, isCompleteMapping, parseOrders } from "@/lib/orders";
import { disconnectSheet } from "./actions";
import { ColumnForm } from "./column-form";
import { ConnectSheetButton } from "./connect-sheet-button";

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<LoadingCard />}>
      <SheetSection searchParams={searchParams} />
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

async function SheetSection({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
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

  const sheetLink = `https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit`;
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

  if (!sheet) {
    return (
      <Card>
        <CardHeader>
          <SheetTitle href={sheetLink} title={connection.spreadsheetName} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-destructive">{problem}</p>
          <SheetActions reconnect />
        </CardContent>
      </Card>
    );
  }

  const { columns } = await searchParams;
  const saved = connection.columnMapping;
  const confirmed = saved && isCompleteMapping(saved, sheet.headers);

  if (!confirmed || columns === "edit") {
    return (
      <Card>
        <CardHeader>
          <SheetTitle href={sheetLink} title={sheet.title} />
          <CardDescription>
            Check which column holds what. The guesses come from your column names; change any
            that are wrong.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ColumnForm
            headers={sheet.headers}
            rows={sheet.rows}
            initial={confirmed ? saved : detectColumns(sheet.headers)}
            editing={Boolean(confirmed)}
          />
          <SheetDetails sheet={sheet} />
        </CardContent>
      </Card>
    );
  }

  const { orders, skipped } = parseOrders(sheet.headers, sheet.rows, saved);
  const dates = orders.map((o) => o.dueDate).sort();
  const revenue = orders.reduce((sum, o) => sum + o.amount, 0);
  const skippedTotal = skipped.noDate + skipped.noAmount;

  return (
    <Card>
      <CardHeader>
        <SheetTitle href={sheetLink} title={sheet.title} />
        <CardDescription>
          {formatCount(orders.length)} orders
          {dates.length > 0 && ` · ${formatDate(dates[0])} – ${formatDate(dates.at(-1)!)}`}
          {skippedTotal > 0 && ` · ${formatCount(skippedTotal)} rows skipped`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Orders" value={formatCount(orders.length)} />
          <Stat label="Revenue (all time)" value={formatAud(revenue)} />
          <Stat
            label="Average order"
            value={orders.length ? formatAud(Math.round(revenue / orders.length)) : "—"}
          />
        </dl>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Columns</h2>
            <Button
              size="sm"
              variant="ghost"
              nativeButton={false}
              render={<Link href="/dashboard?columns=edit" />}
            >
              Edit columns
            </Button>
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            {ROLE_KEYS.map((role) => (
              <div key={role} className="contents">
                <dt className="text-muted-foreground">{ROLES[role].label}</dt>
                <dd>{saved[role] ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="text-xs text-muted-foreground">
          Charts, KPIs and upcoming orders arrive in the next step.
        </p>

        <SheetDetails sheet={sheet} />
        <SheetActions />
      </CardContent>
    </Card>
  );
}

function SheetTitle({ href, title }: { href: string; title: string }) {
  return (
    <CardTitle>
      <a href={href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
        {title}
      </a>
    </CardTitle>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function SheetDetails({ sheet }: { sheet: MergedSheet }) {
  const included = sheet.tabs.filter((t) => t.included).length;
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-muted-foreground select-none">
        Sheet details · {included} of {sheet.tabs.length} tabs used
      </summary>
      <ul className="mt-2 divide-y rounded-lg border">
        {sheet.tabs.map((tab) => (
          <li key={tab.title} className="flex items-center justify-between gap-4 px-3 py-2">
            <span className={tab.included ? "" : "text-muted-foreground line-through"}>
              {tab.title}
            </span>
            <span className="text-right text-muted-foreground">
              {formatCount(tab.rowCount)} rows
              {tab.note && <span className="block text-xs">{tab.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SheetActions({ reconnect = false }: { reconnect?: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ConnectSheetButton variant="outline">
        {reconnect ? "Reconnect sheet" : "Change sheet"}
      </ConnectSheetButton>
      <form action={disconnectSheet}>
        <Button type="submit" variant="ghost">
          Disconnect
        </Button>
      </form>
    </div>
  );
}
