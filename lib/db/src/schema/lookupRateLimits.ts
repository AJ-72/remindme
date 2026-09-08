import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * The enumeration alarm (T3.3) and the rate-limit ledger (T3.2) in one table.
 *
 * Append-only: nothing ever updates or deletes a row here except the
 * eventual retention sweep (not built for beta - rows are cheap and short-
 * lived relevance means an unbounded table is a later problem, not a beta
 * one). No client SELECT grant - only check_lookup_rate_limit() (SECURITY
 * DEFINER) reads this, precisely because a client able to read it could see
 * how close it is to a ceiling and time requests around that.
 */
export const lookupRateLimitsTable = pgTable(
  "lookup_rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callerId: uuid("caller_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    deviceKey: text("device_key").notNull(),
    ip: text("ip").notNull(),
    lookedUpAt: timestamp("looked_up_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lookup_rate_limits_caller_id_idx").on(t.callerId, t.lookedUpAt),
    index("lookup_rate_limits_device_key_idx").on(t.deviceKey, t.lookedUpAt),
    index("lookup_rate_limits_ip_idx").on(t.ip, t.lookedUpAt),

    // INSERT only, and only the rate-limit function does it (as SECURITY
    // DEFINER, so this policy is almost decorative - but per the structural
    // guard in T1.7, a table with zero policies is wide open, so this exists
    // to keep the table RLS-enabled at all).
    pgPolicy("lookup_rate_limits_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`${t.callerId} = auth.uid()`,
    }),
    // No SELECT policy: clients never read this table directly.
  ]
);

export const insertLookupRateLimitSchema = createInsertSchema(lookupRateLimitsTable).omit({
  id: true,
  lookedUpAt: true,
});
export type InsertLookupRateLimit = z.infer<typeof insertLookupRateLimitSchema>;
export type LookupRateLimit = typeof lookupRateLimitsTable.$inferSelect;
