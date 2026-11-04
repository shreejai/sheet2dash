import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dashboards, sheetConnections } from "@/db/schema";
import { generateSpec, readSpec } from "@/lib/dashboard-spec";
import { todayIso } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { getSheet } from "@/lib/google/cached-sheet";
import type { MergedSheet } from "@/lib/google/sheets";
import { ROLES, ROLE_KEYS, detectColumns, isCompleteMapping, parseOrders } from "@/lib/orders";
import { disconnectSheet } from "./actions";
import { ColumnForm } from "./column-form";
import { ConnectSheetButton } from "./connect-sheet-button";
import { DashboardView } from "./dashboard-view";
import { LiveRegion } from "./live-region";

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

  const sheetLink = `https://docs.google.com/spreadsheets/d/${connection.spreadsheetId}/edit`;
  const result = await getSheet(userId, connection.spreadsheetId);

  if (!result.ok) {
    return (
      <Card>
        <CardHeader>
          <SheetTitle href={sheetLink} title={connection.spreadsheetName} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-destructive">{result.problem}</p>
          <SheetActions reconnect />
        </CardContent>
      </Card>
    );
  }

  const { sheet, fetchedAt } = result;
  const { columns } = await searchParams;
  const saved = connection.columnMapping;
  const confirmed = saved && isCompleteMapping(saved, sheet.headers);

  if (!confirmed || columns === "edit") {
    return (
      <Card>
        <CardHeader>
          <SheetTitle href={sheetLink} title={sheet.title} />
          <CardDescription>
            Check which column holds what. The guesses come from your column names; change any that
            are wrong.
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

  const { orders, unpriced, skipped } = parseOrders(sheet.headers, sheet.rows, saved);
  const skippedTotal = skipped.noDate + skipped.noAmount;

  // Widget list: saved when columns were confirmed; generated for older accounts.
  const db = getDb();
  const [stored] = await db.select().from(dashboards).where(eq(dashboards.userId, userId));
  let spec = readSpec(stored?.spec);
  if (!spec) {
    spec = generateSpec(saved);
    await db
      .insert(dashboards)
      .values({ userId, spec })
      .onConflictDoUpdate({ target: dashboards.userId, set: { spec, updatedAt: new Date() } });
  }

  return (
    <div className="flex flex-col gap-6">
      <LiveRegion
        fetchedAt={fetchedAt}
        header={
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-xl font-semibold tracking-tight">
              <a
                href={sheetLink}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {sheet.title}
              </a>
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatCount(orders.length)} orders
              {skippedTotal > 0 &&
                ` · ${formatCount(skippedTotal)} rows not counted (no due date or price)`}
            </p>
          </div>
        }
      >
        <DashboardView orders={orders} unpriced={unpriced} today={todayIso()} spec={spec} />
      </LiveRegion>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Sheet settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
          <SheetDetails sheet={sheet} />
          <SheetActions />
        </CardContent>
      </Card>
    </div>
  );
}

function SheetTitle({ href, title }: { href: string; title: string }) {
  return (
    <CardTitle>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-4 hover:underline"
      >
        {title}
      </a>
    </CardTitle>
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
