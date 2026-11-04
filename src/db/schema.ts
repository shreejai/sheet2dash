import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
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

/** Chat messages sent per user per day (business timezone), for the daily cap. */
export const chatUsage = pgTable(
  "chat_usage",
  {
    userId: text("user_id").notNull(),
    /** YYYY-MM-DD */
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/**
 * People the owner has shared their dashboard with, by email. A signed-in
 * user whose verified email matches can view the owner's dashboard and chat
 * (read-only); the sheet is still read with the owner's Google access.
 */
export const dashboardViewers = pgTable(
  "dashboard_viewers",
  {
    ownerUserId: text("owner_user_id").notNull(),
    /** Lower-cased. */
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerUserId, t.email] }),
    index("dashboard_viewers_email_idx").on(t.email),
  ],
);
