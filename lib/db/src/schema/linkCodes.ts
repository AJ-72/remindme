import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * The dual-SIM repair path.
 *
 * Anand picks Amma's Airtel number; she registered with her Jio one, so the
 * invitation is addressed to a hash nobody owns and expires in silence. She
 * reads him a short code once, and from then on the pair is linked by internal
 * user id and the phone number stops mattering for them.
 *
 * Deliberately a repair tool, not the primary path: contact-picker discovery
 * is what makes the feature usable for the motivating audience, and an opaque
 * id could never be resolved from free text the way "my husband" has to be for
 * M6. The useful second-order property is that if phone lookup ever becomes a
 * liability, this path already exists to be promoted.
 */
export const linkCodesTable = pgTable(
  "link_codes",
  {
    /** Read aloud over a phone call, so short - which is exactly why it is
     * short-lived and single-use rather than a durable identifier. */
    code: text("code").primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /** Single-use: set on redemption, and a second attempt finds it non-null. */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedBy: uuid("consumed_by").references(() => usersTable.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("link_codes_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`${t.userId} = auth.uid()`,
    }),
    pgPolicy("link_codes_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`${t.userId} = auth.uid()`,
    }),
    // No INSERT policy or privilege: a code has to be unguessable and
    // collision-free, which is a property of how it is minted. Redemption by
    // the OTHER party reads a row they do not own, so it cannot be a policy
    // at all - it is a SECURITY DEFINER function, same shape as claiming.
  ]
);

export const insertLinkCodeSchema = createInsertSchema(linkCodesTable).omit({
  createdAt: true,
});
export type InsertLinkCode = z.infer<typeof insertLinkCodeSchema>;
export type LinkCode = typeof linkCodesTable.$inferSelect;
