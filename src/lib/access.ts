import "server-only";
import { auth, createClerkClient, currentUser } from "@clerk/nextjs/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { dashboardViewers, sheetConnections } from "@/db/schema";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export type Access = {
  /** The signed-in user. */
  userId: string;
  /** Whose dashboard they see: themselves, or the owner who shared it with them. */
  ownerId: string;
  role: "owner" | "viewer";
};

/**
 * Whose dashboard the signed-in user sees. Their own sheet wins; otherwise,
 * if an owner has shared with one of their *verified* email addresses, they
 * view that owner's dashboard read-only.
 */
export async function getAccess(): Promise<Access | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const self: Access = { userId, ownerId: userId, role: "owner" };

  const db = getDb();
  const [own] = await db
    .select({ userId: sheetConnections.userId })
    .from(sheetConnections)
    .where(eq(sheetConnections.userId, userId));
  if (own) return self;

  const user = await currentUser();
  const emails = (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
  if (!emails.length) return self;

  const [shared] = await db
    .select({ ownerUserId: dashboardViewers.ownerUserId })
    .from(dashboardViewers)
    .innerJoin(sheetConnections, eq(sheetConnections.userId, dashboardViewers.ownerUserId))
    .where(inArray(dashboardViewers.email, emails))
    .limit(1);
  return shared ? { userId, ownerId: shared.ownerUserId, role: "viewer" } : self;
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
