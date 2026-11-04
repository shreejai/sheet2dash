import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sheetConnections } from "@/db/schema";
import { getSheet } from "./google/cached-sheet";
import { isCompleteMapping, parseOrders, type Order, type UnpricedOrder } from "./orders";

export type LoadedOrders =
  | {
      ok: true;
      title: string;
      orders: Order[];
      unpriced: UnpricedOrder[];
      hasColumn: (role: string) => boolean;
    }
  | { ok: false; problem: string };

/** The user's connected sheet, parsed with their confirmed columns (via the ~30s sheet cache). */
export async function loadOrders(userId: string): Promise<LoadedOrders> {
  const [connection] = await getDb()
    .select()
    .from(sheetConnections)
    .where(eq(sheetConnections.userId, userId));
  if (!connection) return { ok: false, problem: "Connect a Google Sheet first." };

  const result = await getSheet(userId, connection.spreadsheetId);
  if (!result.ok) return { ok: false, problem: result.problem };

  const mapping = connection.columnMapping;
  if (!mapping || !isCompleteMapping(mapping, result.sheet.headers)) {
    return { ok: false, problem: "Confirm your sheet's columns on the dashboard first." };
  }

  const { orders, unpriced } = parseOrders(result.sheet.headers, result.sheet.rows, mapping);
  return {
    ok: true,
    title: result.sheet.title,
    orders,
    unpriced,
    hasColumn: (role) => Boolean(mapping[role as keyof typeof mapping]),
  };
}
