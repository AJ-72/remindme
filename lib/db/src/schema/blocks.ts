import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * "Do not let this person remind me."
 *
 * Rows, not a flag on some other table, because unblock is a DELETE: nothing
 * lingers, and there is no state to get stale. Blocking is per-person; the
 * global "don't let anyone remind me" mute is `users.accepting_reminders`.
 *
 * Unblocking re-delivers nothing. Anything sent during a block stays
 * undelivered - a surprise volley of previously-rejected reminders is how you
 * get re-blocked and uninstalled.
 */
export const blocksTable = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),

    // Every policy keys on blocker_id, never blocked_id. The list belongs to
    // the person who wrote it; being on it grants no visibility of it. The
    // sender learning his reminder was blocked comes from the send path, not
    // from reading her list - which would also disclose everyone else on it.
    pgPolicy("blocks_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`${t.blockerId} = auth.uid()`,
    }),
    pgPolicy("blocks_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`${t.blockerId} = auth.uid()`,
    }),
    pgPolicy("blocks_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`${t.blockerId} = auth.uid()`,
    }),
    // No UPDATE policy: a block has nothing to change. Unblock is a delete.
  ]
);

export const insertBlockSchema = createInsertSchema(blocksTable).omit({ createdAt: true });
export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type Block = typeof blocksTable.$inferSelect;
