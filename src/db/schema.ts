import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { SheetKind, SheetMapping } from "../lib/sheet-kinds";

// Rows are keyed by the Clerk user id. A user can connect several sheets;
// each sheet has its own kind, columns, dashboard layout and sharing list.

/** A Google spreadsheet a user has connected. */
export const sheetConnections = pgTable(
  "sheet_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    spreadsheetId: text("spreadsheet_id").notNull(),
    spreadsheetName: text("spreadsheet_name").notNull(),
    /** What the sheet holds (see lib/sheet-kinds); decides its columns, dashboard and chat. */
    kind: text("kind").$type<SheetKind>().notNull().default("orders"),
    /** Confirmed column roles for its kind, e.g. { dueDate: "due date", amount: "charged" }. Null until confirmed. */
    columnMapping: jsonb("column_mapping").$type<SheetMapping>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The same file can't be connected twice by one user.
  (t) => [unique("sheet_connections_user_sheet_unique").on(t.userId, t.spreadsheetId)],
);

/** The widget layout generated for (and edited by) the owner of a sheet. */
export const dashboards = pgTable("dashboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id")
    .notNull()
    .unique()
    .references(() => sheetConnections.id, { onDelete: "cascade" }),
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
 * People the owner has shared one sheet's dashboard with, by email. A signed-in
 * user whose verified email matches can view that dashboard and chat
 * (read-only); the sheet is still read with the owner's Google access.
 */
export const dashboardViewers = pgTable(
  "dashboard_viewers",
  {
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => sheetConnections.id, { onDelete: "cascade" }),
    /** Lower-cased. */
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.connectionId, t.email] }),
    index("dashboard_viewers_email_idx").on(t.email),
  ],
);
