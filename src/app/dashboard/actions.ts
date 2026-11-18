"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { dashboardViewers, dashboards, sheetConnections } from "@/db/schema";
import { getOwnedSheet, getSheetAccess } from "@/lib/access";
import { fitSpec, generateSpec, readSpec } from "@/lib/dashboard-spec";
import { getSheet, sheetTag } from "@/lib/google/cached-sheet";
import { GoogleApiError, getSpreadsheetMeta } from "@/lib/google/sheets";
import { ROLE_KEYS, isCompleteMapping, type ColumnMapping } from "@/lib/orders";
import { getGoogleToken, type GoogleTokenResult } from "@/lib/google/token";

// Actions that act on one sheet take its id first, so pages can bind it:
// `saveDashboard.bind(null, sheetId)`. Each checks the caller owns the sheet.

async function requireUserId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  return userId;
}

/**
 * Hands the browser a short-lived Google token for the Picker.
 * It only carries the drive.file scope, so it can't see the rest of the Drive.
 */
export async function getPickerToken(): Promise<GoogleTokenResult> {
  return getGoogleToken(await requireUserId());
}

/**
 * Connects a picked spreadsheet. With `replaceSheetId`, that sheet now points
 * at the new file (keeping its layout and sharing); otherwise it's added as
 * another sheet. Returns the sheet's id so the browser can open it.
 */
export async function connectSheet(
  spreadsheetId: string,
  replaceSheetId?: string,
): Promise<{ ok: true; sheetId: string } | { ok: false; error: string }> {
  const userId = await requireUserId();
  if (typeof spreadsheetId !== "string" || !/^[\w-]{10,200}$/.test(spreadsheetId)) {
    return { ok: false, error: "That doesn't look like a Google Sheet." };
  }
  const replacing = replaceSheetId === undefined ? null : await getOwnedSheet(replaceSheetId);
  if (replaceSheetId !== undefined && !replacing) {
    return { ok: false, error: "That sheet isn't yours to change." };
  }

  const token = await getGoogleToken(userId);
  if (token.status !== "ok") {
    return { ok: false, error: "Google access is missing. Try connecting again." };
  }

  // Re-read the name from Google rather than trusting the browser; this also
  // proves the user's token can open the file.
  let title: string;
  try {
    ({ title } = await getSpreadsheetMeta(spreadsheetId, token.token));
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 403 || e.status === 404)) {
      return { ok: false, error: "Couldn't open that spreadsheet. Pick it again from the list." };
    }
    throw e;
  }

  const db = getDb();
  const [already] = await db
    .select({ id: sheetConnections.id })
    .from(sheetConnections)
    .where(and(eq(sheetConnections.userId, userId), eq(sheetConnections.spreadsheetId, spreadsheetId)));

  let sheetId: string;
  if (replacing) {
    const sameSheet = replacing.connection.spreadsheetId === spreadsheetId;
    if (already && !sameSheet) {
      return { ok: false, error: "That spreadsheet is already connected. Switch to it from the menu." };
    }
    await db
      .update(sheetConnections)
      .set({
        spreadsheetId,
        spreadsheetName: title,
        updatedAt: new Date(),
        // A different file needs its columns confirmed again.
        ...(sameSheet ? {} : { columnMapping: null }),
      })
      .where(eq(sheetConnections.id, replacing.connection.id));
    sheetId = replacing.connection.id;
  } else if (already) {
    // Picking a file that's already connected just opens it.
    await db
      .update(sheetConnections)
      .set({ spreadsheetName: title, updatedAt: new Date() })
      .where(eq(sheetConnections.id, already.id));
    sheetId = already.id;
  } else {
    const [created] = await db
      .insert(sheetConnections)
      .values({ userId, spreadsheetId, spreadsheetName: title })
      .returning({ id: sheetConnections.id });
    sheetId = created.id;
  }

  updateTag(sheetTag(userId));
  refresh(); // the header's sheet list changes too
  return { ok: true, sheetId };
}

/** "Refresh" button: drop the cached copy so the page re-reads the sheet now. */
export async function refreshSheet(sheetId: string) {
  // A viewer refreshes the dashboard they're looking at: the owner's sheet.
  const access = await getSheetAccess(sheetId);
  if (!access) throw new Error("Not allowed");
  updateTag(sheetTag(access.ownerId));
}

export async function saveColumnMapping(
  sheetId: string,
  input: ColumnMapping,
): Promise<{ ok: false; error: string } | undefined> {
  const access = await getOwnedSheet(sheetId);
  if (!access) return { ok: false, error: "Connect a sheet first." };
  const { connection, userId } = access;

  // Check the chosen columns against the sheet's real headers, not the browser's copy.
  const result = await getSheet(userId, connection.spreadsheetId);
  if (!result.ok) return { ok: false, error: result.problem };
  const { headers } = result.sheet;

  const mapping: ColumnMapping = {};
  for (const role of ROLE_KEYS) {
    const value = input?.[role];
    if (typeof value === "string" && value) mapping[role] = value;
  }
  if (!isCompleteMapping(mapping, headers)) {
    return { ok: false, error: "Choose a column for the due date and the amount." };
  }

  const db = getDb();
  await db
    .update(sheetConnections)
    .set({ columnMapping: mapping, updatedAt: new Date() })
    .where(eq(sheetConnections.id, connection.id));

  // Keep the owner's layout, minus widgets whose column is no longer mapped;
  // a first-time setup gets the default layout.
  const [stored] = await db
    .select({ spec: dashboards.spec })
    .from(dashboards)
    .where(eq(dashboards.connectionId, connection.id));
  const existing = readSpec(stored?.spec);
  const spec = existing ? fitSpec(existing, mapping) : generateSpec(mapping);
  await db
    .insert(dashboards)
    .values({ connectionId: connection.id, spec })
    .onConflictDoUpdate({ target: dashboards.connectionId, set: { spec, updatedAt: new Date() } });

  redirect(`/dashboard/${connection.id}`);
}

/**
 * Saves the owner's edited layout: which widgets show, their order and
 * options. The spec from the browser is re-validated, and widgets needing an
 * unmapped column are dropped.
 */
export async function saveDashboard(
  sheetId: string,
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await getOwnedSheet(sheetId);
  const mapping = access?.connection.columnMapping;
  if (!access || !mapping) return { ok: false, error: "Set up your sheet first." };

  const spec = readSpec(input);
  if (!spec) return { ok: false, error: "That layout couldn't be saved. Try again." };
  const fitted = fitSpec(spec, mapping);

  await getDb()
    .insert(dashboards)
    .values({ connectionId: access.connection.id, spec: fitted })
    .onConflictDoUpdate({
      target: dashboards.connectionId,
      set: { spec: fitted, updatedAt: new Date() },
    });
  refresh();
  return { ok: true };
}

/** Removes the sheet, with its layout and sharing list, and goes to another one. */
export async function disconnectSheet(sheetId: string) {
  const access = await getOwnedSheet(sheetId);
  if (!access) throw new Error("Not allowed");
  await getDb().delete(sheetConnections).where(eq(sheetConnections.id, access.connection.id));
  refresh(); // the header's sheet list changes too
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Sharing (owner only: each sheet has its own list)

const MAX_VIEWERS = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ShareState = { error?: string; added?: string } | undefined;

export async function addViewer(
  sheetId: string,
  _prev: ShareState,
  formData: FormData,
): Promise<ShareState> {
  const access = await getOwnedSheet(sheetId);
  if (!access) return { error: "Connect a sheet before sharing it." };
  const connectionId = access.connection.id;

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return { error: "Enter a valid email address." };
  }

  const user = await currentUser();
  if (user?.emailAddresses.some((e) => e.emailAddress.toLowerCase() === email)) {
    return { error: "That's your own email address." };
  }

  const db = getDb();
  const existing = await db
    .select({ email: dashboardViewers.email })
    .from(dashboardViewers)
    .where(eq(dashboardViewers.connectionId, connectionId));
  if (existing.some((v) => v.email === email)) return { error: "Already shared with them." };
  if (existing.length >= MAX_VIEWERS) {
    return { error: `You can share with up to ${MAX_VIEWERS} people.` };
  }

  await db.insert(dashboardViewers).values({ connectionId, email }).onConflictDoNothing();
  refresh();
  return { added: email };
}

export async function removeViewer(sheetId: string, email: string) {
  const access = await getOwnedSheet(sheetId);
  if (!access) throw new Error("Not allowed");
  await getDb()
    .delete(dashboardViewers)
    .where(
      and(
        eq(dashboardViewers.connectionId, access.connection.id),
        eq(dashboardViewers.email, String(email).toLowerCase()),
      ),
    );
  refresh();
}
