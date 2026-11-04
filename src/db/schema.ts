import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ColumnMapping } from "../lib/orders";

// Every table is keyed by the Clerk user id, so a second business can be
// added later without a migration of existing rows.

/** The Google spreadsheet a user has connected (one per user in v1). */
export const sheetConnections = pgTable("sheet_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  spreadsheetId: text("spreadsheet_id").notNull(),
  spreadsheetName: text("spreadsheet_name").notNull(),
  /** Confirmed column roles, e.g. { dueDate: "due date", amount: "charged" }. Null until confirmed. */
  columnMapping: jsonb("column_mapping").$type<ColumnMapping>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The widget layout generated for (and edited by) a user. */
export const dashboards = pgTable("dashboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  spec: jsonb("spec").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
