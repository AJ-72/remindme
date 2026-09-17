import { sql } from "drizzle-orm";
import { boolean, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * An opted-in person.
 *
 * A row exists ONLY once a phone number has been bound, which is a verified
 * server operation. A user who never binds has no row and makes no network
 * calls at all - that is what preserves the promise that a solo install never
 * phones home.
 */
export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * HMAC of the E.164 number, computed server-side with a secret pepper.
     *
     * Never a plain hash: India's mobile number space is ~10^9, so an unsalted
     * table is brute-forceable in hours and a leak would be a leaked contact
     * list. Plaintext numbers transit the server and are never stored.
     *
     * Whoever can write this column owns that number, so the client is not
     * granted it - see `privileges.ts`.
     */
    phoneHash: text("phone_hash").notNull().unique(),

    displayName: text("display_name"),

    /** Whether a lookup by phone hash resolves to this user. */
    discoverable: boolean("discoverable").notNull().default(true),

    /**
     * The global "don't let anyone remind me" mute.
     *
     * Deliberately NOT the same switch as `discoverable`, and neither one
     * deletes the account. Conflating the three is how the first draft made
     * "mute everyone for a week" destroy the block list.
     */
    acceptingReminders: boolean("accepting_reminders").notNull().default(true),

    /**
     * Drives the 45-day rebind window. A re-verification within 45 days of
     * this recovers the account; past it, verification creates a fresh one.
     * 45 is the floor of Indian carrier number-recycling (45-90 days).
     */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Self only. Finding someone else by number is the peppered SECURITY
    // DEFINER lookup, which answers one number at a time; no policy here
    // should ever make this table readable in bulk.
    pgPolicy("users_select_self", {
      for: "select",
      to: "authenticated",
      using: sql`${t.id} = auth.uid()`,
    }),
    // WITH CHECK as well as USING: without it a user could update their row
    // and set id to someone else's, handing their own row away.
    pgPolicy("users_update_self", {
      for: "update",
      to: "authenticated",
      using: sql`${t.id} = auth.uid()`,
      withCheck: sql`${t.id} = auth.uid()`,
    }),
    pgPolicy("users_delete_self", {
      for: "delete",
      to: "authenticated",
      using: sql`${t.id} = auth.uid()`,
    }),
    // No INSERT policy, deliberately. Account creation happens only after
    // number verification, so it is a server operation; RLS default-deny and
    // the withheld INSERT privilege both refuse it.
  ]
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  lastActiveAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
