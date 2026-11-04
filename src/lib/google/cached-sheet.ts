import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { GoogleApiError, fetchMergedSheet, type MergedSheet } from "./sheets";
import { getGoogleToken } from "./token";

export type SheetResult =
  { ok: true; sheet: MergedSheet; fetchedAt: number } | { ok: false; problem: string };

/** Cache tag for everything read from a user's sheet. */
export const sheetTag = (userId: string) => `sheet:${userId}`;

/**
 * The user's merged sheet, cached ~30s per user + sheet so the dashboard's
 * polling doesn't spend the Google Sheets quota. Remote (shared) cache, since
 * serverless instances don't keep memory between requests. `refreshSheet`
 * clears it on demand.
 */
export async function getSheet(userId: string, spreadsheetId: string): Promise<SheetResult> {
  "use cache: remote";
  cacheTag(sheetTag(userId));

  const token = await getGoogleToken(userId);
  if (token.status !== "ok") {
    cacheLife("seconds");
    return {
      ok: false,
      problem: "Google access has expired or is missing. Reconnect to continue.",
    };
  }

  try {
    const sheet = await fetchMergedSheet(spreadsheetId, token.token);
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return { ok: true, sheet, fetchedAt: Date.now() };
  } catch (e) {
    if (!(e instanceof GoogleApiError)) throw e;
    cacheLife("seconds");
    return {
      ok: false,
      problem:
        e.status === 403 || e.status === 404
          ? "This app can't open the sheet any more. Pick it again to restore access."
          : `Google Sheets returned an error: ${e.message}`,
    };
  }
}
