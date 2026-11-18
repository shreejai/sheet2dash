import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dashboardViewers, dashboards } from "@/db/schema";
import { getSheetAccess, ownerDisplayName } from "@/lib/access";
import { fitSpec, generateSpec, readSpec } from "@/lib/dashboard-spec";
import { todayIso } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { getSheet } from "@/lib/google/cached-sheet";
import type { MergedSheet } from "@/lib/google/sheets";
import { parseOrders } from "@/lib/orders";
import {
  KINDS,
  SHEET_KINDS,
  detectKind,
  isSheetKind,
  roleKeys,
  type SheetKind,
} from "@/lib/sheet-kinds";
import { parseWorkouts } from "@/lib/workouts";
import { disconnectSheet, saveDashboard } from "../actions";
import { ColumnForm } from "../column-form";
import { ConnectSheetButton } from "../connect-sheet-button";
import { EditDashboard } from "../edit-dashboard";
import { DashboardView } from "../dashboard-view";
import { LiveRegion } from "../live-region";
import { Sharing } from "../sharing";

type Props = PageProps<"/dashboard/[sheet]">;

export default function DashboardPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<LoadingCard />}>
      <SheetSection params={params} searchParams={searchParams} />
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

async function SheetSection({ params, searchParams }: Props) {
  const { sheet: sheetId } = await params;
  const access = await getSheetAccess(sheetId);
  if (!access) notFound();
  // A viewer sees the owner's dashboard (read-only), read with the owner's Google access.
  const { ownerId: userId, role, connection } = access;
  const isOwner = role === "owner";

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
          {isOwner && <SheetActions sheetId={sheetId} reconnect />}
        </CardContent>
      </Card>
    );
  }

  const { sheet, fetchedAt } = result;
  const { columns, kind: kindParam } = await searchParams;
  const saved = connection.columnMapping;
  const confirmed = Boolean(saved && KINDS[connection.kind].isComplete(saved, sheet.headers));

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
    // The kind shown: the owner's pick on this screen, else the saved one, else a guess.
    const kind = isSheetKind(kindParam)
      ? kindParam
      : confirmed
        ? connection.kind
        : detectKind(sheet.headers);
    const keepSaved = confirmed && kind === connection.kind;
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <SheetTitle href={sheetLink} title={sheet.title} />
            <CardDescription>
              Check what this sheet holds and which column holds what. The guesses come from your
              column names; change any that are wrong.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <KindChoice
              sheetId={sheetId}
              current={kind}
              editing={confirmed}
              savedKind={connection.kind}
            />
            <ColumnForm
              key={kind}
              sheetId={sheetId}
              kind={kind}
              headers={sheet.headers}
              rows={sheet.rows}
              initial={keepSaved ? saved! : KINDS[kind].detect(sheet.headers)}
              editing={confirmed}
            />
          </CardContent>
        </Card>
        <SheetDetails sheet={sheet} />
      </div>
    );
  }

  const db = getDb();
  const viewers = isOwner
    ? (
        await db
          .select({ email: dashboardViewers.email })
          .from(dashboardViewers)
          .where(eq(dashboardViewers.connectionId, sheetId))
          .orderBy(asc(dashboardViewers.createdAt))
      ).map((v) => v.email)
    : [];
  const sharedBy = isOwner ? null : await ownerDisplayName(userId);

  // Settings as grouped sections, like iOS Settings: a heading, a card, a footnote.
  const settings = isOwner && (
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
            render={<Link href={`/dashboard/${sheetId}?columns=edit`} />}
          >
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-separator text-sm">
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt>Sheet type</dt>
              <dd className="text-right text-muted-foreground">{KINDS[connection.kind].label}</dd>
            </div>
            {roleKeys(connection.kind).map((role) => (
              <div key={role} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt>{KINDS[connection.kind].roles[role].label}</dt>
                <dd className="min-w-0 truncate text-right text-muted-foreground">
                  {saved![role] ?? "Not used"}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Sharing sheetId={sheetId} viewers={viewers} />
      <SheetDetails sheet={sheet} />
      <SheetActions sheetId={sheetId} />
    </section>
  );

  const header = (counts: string) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <h1 className="title-2">
        <a href={sheetLink} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
          {sheet.title}
        </a>
      </h1>
      <p className="text-xs text-muted-foreground">{counts}</p>
      {sharedBy && (
        <p className="text-xs text-muted-foreground">Shared with you by {sharedBy} · view only</p>
      )}
    </div>
  );

  if (connection.kind === "fitness") {
    const { entries, bodyWeights, skipped } = parseWorkouts(sheet.headers, sheet.rows, saved!);
    const sessions = new Set(entries.map((e) => e.date)).size;
    const sets = entries.reduce((n, e) => n + (e.sets ?? 0), 0);
    const skippedTotal = skipped.noDate + skipped.noExercise;
    return (
      <div className="flex flex-col gap-6">
        <LiveRegion
          sheetId={sheetId}
          fetchedAt={fetchedAt}
          header={header(
            `${formatCount(sessions)} sessions · ${formatCount(entries.length)} exercises` +
              (skippedTotal > 0
                ? ` · ${formatCount(skippedTotal)} rows not counted (no date or exercise)`
                : ""),
          )}
        >
          {/* Placeholder until the workout widgets land (PLAN.md v2, step 4). */}
          <Card>
            <CardHeader>
              <CardTitle>Your workout dashboard is on its way</CardTitle>
              <CardDescription>
                Read from your sheet so far: {formatCount(sessions)} sessions,{" "}
                {formatCount(entries.length)} exercises, {formatCount(sets)} sets
                {bodyWeights.length > 0 &&
                  `, ${formatCount(bodyWeights.length)} body-weight readings`}
                .
              </CardDescription>
            </CardHeader>
          </Card>
        </LiveRegion>
        {settings}
      </div>
    );
  }

  const { orders, unpriced, skipped } = parseOrders(sheet.headers, sheet.rows, saved!);
  const skippedTotal = skipped.noDate + skipped.noAmount;

  // Widget list: saved when columns were confirmed; generated for older accounts.
  const [stored] = await db
    .select()
    .from(dashboards)
    .where(eq(dashboards.connectionId, sheetId));
  let spec = readSpec(stored?.spec);
  if (!spec) {
    spec = generateSpec(saved!);
    await db
      .insert(dashboards)
      .values({ connectionId: sheetId, spec })
      .onConflictDoUpdate({
        target: dashboards.connectionId,
        set: { spec, updatedAt: new Date() },
      });
  }

  // Never show a widget whose column has since been un-mapped.
  spec = fitSpec(spec, saved!);

  return (
    <div className="flex flex-col gap-6">
      <LiveRegion
        sheetId={sheetId}
        fetchedAt={fetchedAt}
        actions={
          isOwner && (
            <EditDashboard
              spec={spec}
              mapping={saved!}
              onSave={saveDashboard.bind(null, sheetId)}
            />
          )
        }
        header={header(
          `${formatCount(orders.length)} orders` +
            (skippedTotal > 0
              ? ` · ${formatCount(skippedTotal)} rows not counted (no due date or price)`
              : ""),
        )}
      >
        <DashboardView orders={orders} unpriced={unpriced} today={todayIso()} spec={spec} />
      </LiveRegion>
      {settings}
    </div>
  );
}

/** What the sheet holds. Switching re-guesses the columns for that kind. */
function KindChoice({
  sheetId,
  current,
  editing,
  savedKind,
}: {
  sheetId: string;
  current: SheetKind;
  editing: boolean;
  savedKind: SheetKind;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p id="kind-label" className="text-sm font-medium">
        This sheet is a log of…
      </p>
      <nav aria-labelledby="kind-label" className="flex flex-wrap gap-2">
        {SHEET_KINDS.map((k) => (
          <Link
            key={k}
            replace
            scroll={false}
            href={`/dashboard/${sheetId}?columns=edit&kind=${k}`}
            aria-current={k === current ? "true" : undefined}
            className={
              k === current
                ? "pressable rounded-full bg-tint px-3.5 py-1.5 text-sm font-semibold text-white"
                : "pressable rounded-full bg-fill px-3.5 py-1.5 text-sm font-medium"
            }
          >
            {KINDS[k].label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">
        {KINDS[current].description}.
        {editing &&
          current !== savedKind &&
          " Saving as a different type replaces this dashboard's layout with that type's default."}
      </p>
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

function SheetActions({ sheetId, reconnect = false }: { sheetId: string; reconnect?: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ConnectSheetButton variant="outline" replaceSheetId={sheetId}>
        {reconnect ? "Reconnect sheet" : "Change sheet"}
      </ConnectSheetButton>
      <form action={disconnectSheet.bind(null, sheetId)}>
        <Button type="submit" variant="destructive">
          Disconnect
        </Button>
      </form>
    </div>
  );
}
