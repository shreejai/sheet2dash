"use server";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb } from "@/db";
import { sheetConnections } from "@/db/schema";
import { GoogleApiError, getSpreadsheetMeta } from "@/lib/google/sheets";
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

  refresh();
  return { ok: true };
}

export async function disconnectSheet() {
  const userId = await requireUserId();
  await getDb().delete(sheetConnections).where(eq(sheetConnections.userId, userId));
  refresh();
}
