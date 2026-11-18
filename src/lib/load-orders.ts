import "server-only";
import type { Connection } from "./access";
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

/** A connected orders sheet, parsed with its confirmed columns (via the ~30s sheet cache). */
export async function loadOrders(connection: Connection): Promise<LoadedOrders> {
  if (connection.kind !== "orders") return { ok: false, problem: "This isn't an orders sheet." };
  const result = await getSheet(connection.userId, connection.spreadsheetId);
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
