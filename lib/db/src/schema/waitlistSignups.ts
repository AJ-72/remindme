import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Email addresses collected from the public landing page.
 *
 * This is deliberately separate from app users: a waitlist signup is not an
 * account, and the web client is never allowed to read or write this table.
 * The join-waitlist Edge Function is the sole public write path.
 */
export const waitlistSignupsTable = pgTable(
  "waitlist_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The Edge Function lowercases and trims before inserting. Keeping the
    // database invariant prevents duplicate casing variants from slipping in
    // if another server-side import path is added later.
    email: text("email").notNull().unique(),
    source: text("source").notNull().default("landing-page"),
    platform: text("platform").notNull().default("android"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("waitlist_signups_no_client_access", {
      for: "all",
      to: "authenticated",
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ]
);

export const insertWaitlistSignupSchema = createInsertSchema(waitlistSignupsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWaitlistSignup = z.infer<typeof insertWaitlistSignupSchema>;
export type WaitlistSignup = typeof waitlistSignupsTable.$inferSelect;
