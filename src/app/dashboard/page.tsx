import { Suspense } from "react";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dashboardViewers, dashboards, sheetConnections } from "@/db/schema";
import { getAccess, ownerDisplayName } from "@/lib/access";
import { fitSpec, generateSpec, readSpec } from "@/lib/dashboard-spec";
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
import { EditDashboard } from "./edit-dashboard";
import { DashboardView } from "./dashboard-view";
import { LiveRegion } from "./live-region";
import { Sharing } from "./sharing";

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
  const access = await getAccess();
  if (!access) return null; // the proxy already redirects signed-out users
  // A viewer sees the owner's dashboard (read-only); everyone else sees their own.
  const { ownerId: userId, role } = access;
  const isOwner = role === "owner";

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
          <p className="text-sm text-destructive">
            {isOwner
              ? result.problem
              : "The dashboard can't read the sheet right now. Ask the person who shared it to reconnect it."}
          </p>
          {isOwner && <SheetActions reconnect />}
        </CardContent>
      </Card>
    );
  }

  const { sheet, fetchedAt } = result;
  const { columns } = await searchParams;
  const saved = connection.columnMapping;
  const confirmed = saved && isCompleteMapping(saved, sheet.headers);

  if (!confirmed && !isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{sheet.title}</CardTitle>
          <CardDescription>
            This dashboard isn&apos;t set up yet. It will appear here once its owner confirms the
            sheet&apos;s columns.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!confirmed || (isOwner && columns === "edit")) {
    return (
      <div className="flex flex-col gap-4">
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
          </CardContent>
        </Card>
        <SheetDetails sheet={sheet} />
      </div>
    );
  }

  const { orders, unpriced, skipped } = parseOrders(sheet.headers, sheet.rows, saved!);
  const skippedTotal = skipped.noDate + skipped.noAmount;

  // Widget list: saved when columns were confirmed; generated for older accounts.
  const db = getDb();
  const [stored] = await db.select().from(dashboards).where(eq(dashboards.userId, userId));
  let spec = readSpec(stored?.spec);
  if (!spec) {
    spec = generateSpec(saved!);
    await db
      .insert(dashboards)
      .values({ userId, spec })
      .onConflictDoUpdate({ target: dashboards.userId, set: { spec, updatedAt: new Date() } });
  }

  // Never show a widget whose column has since been un-mapped.
  spec = fitSpec(spec, saved!);

  const viewers = isOwner
    ? (
        await db
          .select({ email: dashboardViewers.email })
          .from(dashboardViewers)
          .where(eq(dashboardViewers.ownerUserId, userId))
          .orderBy(asc(dashboardViewers.createdAt))
      ).map((v) => v.email)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <LiveRegion
        fetchedAt={fetchedAt}
        actions={isOwner && <EditDashboard spec={spec} mapping={saved!} />}
        header={
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="title-2">
              <a
                href={sheetLink}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {sheet.title}
              </a>
            </h1>
            <p className="text-xs text-muted-foreground">
              {formatCount(orders.length)} orders
              {skippedTotal > 0 &&
                ` · ${formatCount(skippedTotal)} rows not counted (no due date or price)`}
            </p>
            {!isOwner && (
              <p className="text-xs text-muted-foreground">
                Shared with you by {await ownerDisplayName(userId)} · view only
              </p>
            )}
          </div>
        }
      >
        <DashboardView orders={orders} unpriced={unpriced} today={todayIso()} spec={spec} />
      </LiveRegion>

      {/* Settings as grouped sections, like iOS Settings: a heading, a card, a footnote. */}
      {isOwner && (
        <section aria-labelledby="settings-heading" className="flex flex-col gap-3 pt-4">
          <h2 id="settings-heading" className="title-2 px-1">
            Settings
          </h2>
          <Card size="sm">
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>Columns</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                nativeButton={false}
                render={<Link href="/dashboard?columns=edit" />}
              >
                Edit
              </Button>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-separator text-sm">
                {ROLE_KEYS.map((role) => (
                  <div key={role} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt>{ROLES[role].label}</dt>
                    <dd className="min-w-0 truncate text-right text-muted-foreground">
                      {saved![role] ?? "Not used"}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Sharing viewers={viewers} />
          <SheetDetails sheet={sheet} />
          <SheetActions />
        </section>
      )}
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
    <Card size="sm">
      <CardContent>
        <details className="group text-sm">
          <summary className="flex cursor-pointer items-center justify-between gap-2 py-1 select-none pointer-coarse:py-2.5">
            <span className="headline">Sheet tabs</span>
            <span className="text-muted-foreground">
              {included} of {sheet.tabs.length} used
            </span>
          </summary>
          <ul className="mt-1 divide-y divide-separator">
            {sheet.tabs.map((tab) => (
              <li key={tab.title} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className={tab.included ? "" : "text-muted-foreground line-through"}>
                  {tab.title}
                </span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {formatCount(tab.rowCount)} rows
                  {tab.note && <span className="block text-xs">{tab.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

function SheetActions({ reconnect = false }: { reconnect?: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ConnectSheetButton variant="outline">
        {reconnect ? "Reconnect sheet" : "Change sheet"}
      </ConnectSheetButton>
      <form action={disconnectSheet}>
        <Button type="submit" variant="destructive">
          Disconnect
        </Button>
      </form>
    </div>
  );
}
