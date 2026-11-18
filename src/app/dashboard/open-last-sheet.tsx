import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listSheets } from "@/lib/access";
import { LAST_SHEET_COOKIE } from "@/lib/last-sheet";

/**
 * Sends the user to the sheet they last opened (or their first one), at
 * `section` within it. Renders nothing; with no sheets it shows `fallback`.
 */
export async function OpenLastSheet({
  section = "",
  fallback,
}: {
  section?: "" | "/chat";
  fallback: React.ReactNode;
}) {
  const sheets = await listSheets();
  if (!sheets.length) return fallback;
  const last = (await cookies()).get(LAST_SHEET_COOKIE)?.value;
  const sheet = sheets.find((s) => s.id === last) ?? sheets[0];
  redirect(`/dashboard/${sheet.id}${section}`);
}
