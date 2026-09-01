import { sql } from "drizzle-orm";
import { index, pgEnum, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Mirrors the client state machine in
 * `artifacts/mobile/utils/invitationStatus.ts`. An enum rather than free text
 * so a status the machine has no transition for cannot reach the database.
 *
 * "Recipient has no app" is deliberately absent. That is a Tier 1 reminder,
 * not a status; giving it one would force every consumer to special-case a
 * value that never transitions.
 */
export const invitationStatusEnum = pgEnum("invitation_status", [
  "invited",
  "accepted",
  "rescheduled",
  "done",
  "declined",
  "blocked",
  "expired",
  "cancelled",
]);

/** How `title`/`description` are stored. Present from day one so end-to-end
 * encryption can be added without a migration - the schema shape is the part
 * that would otherwise be expensive to change later. */
export const contentEncryptionEnum = pgEnum("content_encryption", ["none"]);

/**
 * The mailbox.
 *
 * The server is a mailbox, not a runtime: an accepted reminder is transferred
 * to the recipient's device and fires from her own local schedule. Nothing
 * here is on the critical path of a reminder going off.
 */
export const invitationsTable = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    senderId: uuid("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    /**
     * NOT a foreign key, deliberately - the single most load-bearing decision
     * in this table.
     *
     * It lets an invitation be addressed to someone with no account yet, which
     * is what makes registration self-claiming: a new user asks "any pending
     * invitations for my hash?" and collects them. That is also why no
     * deferred deep linking is needed anywhere in this feature - the
     * invitation is addressed to a number, not to a device or an install
     * session, so it finds her rather than having to survive the trip through
     * the Play Store.
     */
    recipientPhoneHash: text("recipient_phone_hash").notNull(),

    /** Filled in on claim. Null means nobody owns this row yet. */
    recipientId: uuid("recipient_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),

    /** Nulled on accept or expiry - the mailbox is not an archive. The row
     * survives so "it never arrived" stays debuggable. */
    title: text("title"),
    description: text("description"),
    contentEncryption: contentEncryptionEnum("content_encryption").notNull().default("none"),

    datetime: timestamp("datetime", { withTimezone: true }).notNull(),

    /** Preserved so the sender's list can read "9:00 (you sent 8:00)" after a
     * reschedule. Same problem and same solution as `Reminder.originalDatetime`
     * on the client, which exists because snooze overwrites `datetime`. */
    originalDatetime: timestamp("original_datetime", { withTimezone: true }).notNull(),

    status: invitationStatusEnum("status").notNull().default("invited"),

    /** Equal to `datetime`: an unaccepted reminder for 08:00 is meaningless at
     * 08:01, so that is when it dies. A fixed TTL is wrong for both a reminder
     * ten minutes out and one next month. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /**
     * When title/description must be gone: `least(datetime, created_at + 30
     * days)`.
     *
     * A separate column rather than a predicate a cleanup job computes,
     * because the 30-day cap is what makes the stated retention policy true.
     * "Remind Amma about the anniversary next June" would otherwise sit in a
     * Postgres table holding its content for nine months while the privacy
     * policy claimed a mailbox.
     */
    contentExpiresAt: timestamp("content_expires_at", { withTimezone: true }).notNull(),

    /** Set on reaching a terminal state; the row is purged 30 days later. */
    terminalAt: timestamp("terminal_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The claim function's lookup. Unindexed, it degrades into a full scan on
    // the one query every new registration runs.
    index("invitations_recipient_phone_hash_idx").on(t.recipientPhoneHash),
    // Both retention sweeps.
    index("invitations_content_expires_at_idx").on(t.contentExpiresAt),

    pgPolicy("invitations_select_involved", {
      for: "select",
      to: "authenticated",
      using: sql`${t.senderId} = auth.uid() or ${t.recipientId} = auth.uid()`,
    }),
    // No INSERT or UPDATE policy, and no privilege either - see
    // `privileges.ts`. Sending has to consult a block list the sender cannot
    // read, and every transition has to notify the other party and enforce
    // who may change what. Both are server operations.
  ]
);

export const insertInvitationSchema = createInsertSchema(invitationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitationsTable.$inferSelect;
export type InvitationStatus = (typeof invitationStatusEnum.enumValues)[number];
