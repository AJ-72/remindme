import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * A handset that can receive pushes for a user. One user, many devices.
 *
 * On every rebind of a phone number to a new device key, every row here for
 * that account is revoked - that is the only signal a real owner gets that
 * their account was recovered somewhere else.
 */
export const devicesTable = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    /**
     * Unique across all accounts: one handset, one home. A device that
     * rebinds to a different account must MOVE the token, and the constraint
     * is what turns "forgot to clear the old row" into an error instead of a
     * handset quietly receiving two people's reminders.
     */
    expoPushToken: text("expo_push_token").notNull().unique(),

    platform: text("platform").notNull(),

    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("devices_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`${t.userId} = auth.uid()`,
    }),
    pgPolicy("devices_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`${t.userId} = auth.uid()`,
    }),
    // Both clauses: USING alone would let a caller hand their own row to
    // another account, pointing a token they control at someone else's
    // reminders.
    pgPolicy("devices_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`${t.userId} = auth.uid()`,
      withCheck: sql`${t.userId} = auth.uid()`,
    }),
    pgPolicy("devices_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`${t.userId} = auth.uid()`,
    }),
  ]
);

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
