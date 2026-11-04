"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { dashboardViewers, dashboards, sheetConnections } from "@/db/schema";
import { getAccess } from "@/lib/access";
import { generateSpec } from "@/lib/dashboard-spec";
import { getSheet, sheetTag } from "@/lib/google/cached-sheet";
import { GoogleApiError, getSpreadsheetMeta } from "@/lib/google/sheets";
import { ROLE_KEYS, isCompleteMapping, type ColumnMapping } from "@/lib/orders";
import { getGoogleToken, type GoogleTokenResult } from "@/lib/google/token";

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

export async function connectSheet(
  spreadsheetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();
  if (typeof spreadsheetId !== "string" || !/^[\w-]{10,200}$/.test(spreadsheetId)) {
    return { ok: false, error: "That doesn't look like a Google Sheet." };
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
  const [existing] = await db
    .select({ spreadsheetId: sheetConnections.spreadsheetId })
    .from(sheetConnections)
    .where(eq(sheetConnections.userId, userId));
  const sameSheet = existing?.spreadsheetId === spreadsheetId;

  await db
    .insert(sheetConnections)
    .values({ userId, spreadsheetId, spreadsheetName: title })
    .onConflictDoUpdate({
      target: sheetConnections.userId,
      set: {
        spreadsheetId,
        spreadsheetName: title,
        updatedAt: new Date(),
        // A different sheet needs its columns confirmed again.
        ...(sameSheet ? {} : { columnMapping: null }),
      },
    });

  updateTag(sheetTag(userId));
  return { ok: true };
}

/** "Refresh" button: drop the cached copy so the page re-reads the sheet now. */
export async function refreshSheet() {
  // A viewer refreshes the dashboard they're looking at: the owner's sheet.
  const access = await getAccess();
  if (!access) throw new Error("Not signed in");
  updateTag(sheetTag(access.ownerId));
}

export async function saveColumnMapping(
  input: ColumnMapping,
): Promise<{ ok: false; error: string } | undefined> {
  const userId = await requireUserId();
  const db = getDb();
  const [connection] = await db
    .select({ spreadsheetId: sheetConnections.spreadsheetId })
    .from(sheetConnections)
    .where(eq(sheetConnections.userId, userId));
  if (!connection) return { ok: false, error: "Connect a sheet first." };

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

  await db
    .update(sheetConnections)
    .set({ columnMapping: mapping, updatedAt: new Date() })
    .where(eq(sheetConnections.userId, userId));

  // Rebuild the widget list for the confirmed columns.
  const spec = generateSpec(mapping);
  await db
    .insert(dashboards)
    .values({ userId, spec })
    .onConflictDoUpdate({ target: dashboards.userId, set: { spec, updatedAt: new Date() } });

  redirect("/dashboard");
}

export async function disconnectSheet() {
  const userId = await requireUserId();
  await getDb().delete(sheetConnections).where(eq(sheetConnections.userId, userId));
  refresh();
}

// ---------------------------------------------------------------------------
// Sharing (owner only: these act on the signed-in user's own dashboard)

const MAX_VIEWERS = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ShareState = { error?: string; added?: string } | undefined;

export async function addViewer(_prev: ShareState, formData: FormData): Promise<ShareState> {
  const userId = await requireUserId();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return { error: "Enter a valid email address." };
  }

  const db = getDb();
  const [connection] = await db
    .select({ userId: sheetConnections.userId })
    .from(sheetConnections)
    .where(eq(sheetConnections.userId, userId));
  if (!connection) return { error: "Connect a sheet before sharing it." };

  const user = await currentUser();
  if (user?.emailAddresses.some((e) => e.emailAddress.toLowerCase() === email)) {
    return { error: "That's your own email address." };
  }

  const existing = await db
    .select({ email: dashboardViewers.email })
    .from(dashboardViewers)
    .where(eq(dashboardViewers.ownerUserId, userId));
  if (existing.some((v) => v.email === email)) return { error: "Already shared with them." };
  if (existing.length >= MAX_VIEWERS) {
    return { error: `You can share with up to ${MAX_VIEWERS} people.` };
  }

  await db.insert(dashboardViewers).values({ ownerUserId: userId, email }).onConflictDoNothing();
  refresh();
  return { added: email };
}

export async function removeViewer(email: string) {
  const userId = await requireUserId();
  await getDb()
    .delete(dashboardViewers)
    .where(
      and(
        eq(dashboardViewers.ownerUserId, userId),
        eq(dashboardViewers.email, String(email).toLowerCase()),
      ),
    );
  refresh();
}
