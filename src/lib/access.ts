import "server-only";
import { auth, createClerkClient, currentUser } from "@clerk/nextjs/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { dashboardViewers, sheetConnections } from "@/db/schema";
import type { SheetKind } from "./sheet-kinds";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export type Connection = typeof sheetConnections.$inferSelect;

export type SheetAccess = {
  /** The signed-in user. */
  userId: string;
  /** Whose sheet it is: the user, or the owner who shared it with them. */
  ownerId: string;
  role: "owner" | "viewer";
  connection: Connection;
};

export type SheetSummary = {
  id: string;
  name: string;
  kind: SheetKind;
  role: "owner" | "viewer";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sheet ids come from URLs and requests; anything else is never a sheet. */
export const isSheetId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

/** The signed-in user's verified email addresses, lower-cased. */
async function verifiedEmails() {
  const user = await currentUser();
  return (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
}

/**
 * Whether the signed-in user can see this sheet, and as what: its owner, or a
 * viewer an owner shared it with (by one of their *verified* emails).
 */
export async function getSheetAccess(sheetId: unknown): Promise<SheetAccess | null> {
  const { userId } = await auth();
  if (!userId || !isSheetId(sheetId)) return null;

  const db = getDb();
  const [connection] = await db
    .select()
    .from(sheetConnections)
    .where(eq(sheetConnections.id, sheetId));
  if (!connection) return null;
  if (connection.userId === userId) {
    return { userId, ownerId: userId, role: "owner", connection };
  }

  const emails = await verifiedEmails();
  if (!emails.length) return null;
  const [shared] = await db
    .select({ email: dashboardViewers.email })
    .from(dashboardViewers)
    .where(and(eq(dashboardViewers.connectionId, sheetId), inArray(dashboardViewers.email, emails)))
    .limit(1);
  return shared ? { userId, ownerId: connection.userId, role: "viewer", connection } : null;
}

/** Only the owner may change a sheet: its columns, layout, sharing, or the file itself. */
export async function getOwnedSheet(sheetId: unknown): Promise<SheetAccess | null> {
  const access = await getSheetAccess(sheetId);
  return access?.role === "owner" ? access : null;
}

/** Every sheet the signed-in user can open: their own first, then ones shared with them. */
export async function listSheets(): Promise<SheetSummary[]> {
  const { userId } = await auth();
  if (!userId) return [];

  const db = getDb();
  const summary = {
    id: sheetConnections.id,
    name: sheetConnections.spreadsheetName,
    kind: sheetConnections.kind,
  };
  const own = await db
    .select(summary)
    .from(sheetConnections)
    .where(eq(sheetConnections.userId, userId))
    .orderBy(asc(sheetConnections.createdAt));

  const emails = await verifiedEmails();
  const shared = emails.length
    ? await db
        .selectDistinct(summary)
        .from(dashboardViewers)
        .innerJoin(sheetConnections, eq(sheetConnections.id, dashboardViewers.connectionId))
        .where(inArray(dashboardViewers.email, emails))
    : [];

  return [
    ...own.map((s) => ({ ...s, role: "owner" as const })),
    ...shared
      .filter((s) => !own.some((o) => o.id === s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ ...s, role: "viewer" as const })),
  ];
}

/** "Shreejai" (or their email) — shown to viewers as who shared the dashboard. */
export async function ownerDisplayName(ownerId: string) {
  try {
    const owner = await clerk.users.getUser(ownerId);
    return owner.firstName || owner.primaryEmailAddress?.emailAddress || "the owner";
  } catch {
    return "the owner";
  }
}
