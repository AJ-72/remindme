-- Table and column privileges for the `authenticated` and `anon` roles.
--
-- RLS decides which ROWS a caller may touch. It cannot say which COLUMNS, and
-- some of the sharpest rules in this schema are column-shaped: whoever can
-- write `users.phone_hash` owns that phone number, whichever row they are
-- allowed to write. Postgres column privileges are the engine-level tool for
-- that, so they live beside the schema rather than inside a function some
-- future endpoint could forget to call.
--
-- `drizzle-kit push` does NOT manage grants. Apply this after every push:
--   pnpm --filter @workspace/db run push
--   pnpm --filter @workspace/db run push:privileges
-- or paste it into the Supabase SQL editor. The schema tests apply this exact
-- file, so what they exercise is what production runs.

-- Start from nothing rather than trimming a blanket grant, so a newly added
-- table is unreachable by clients until someone deliberately opens it.
revoke all on all tables in schema public from authenticated, anon;
revoke all on all sequences in schema public from authenticated, anon;

-- users: readable and deletable as a whole row, but writable only on the three
-- profile columns. phone_hash is bound by a verified server operation, and
-- last_active_at is a server observation, so neither is offered.
grant select, delete on users to authenticated;
grant update (display_name, discoverable, accepting_reminders) on users to authenticated;

-- devices: a handset registers and maintains its own row.
grant select, insert, update, delete on devices to authenticated;

-- blocks: block and unblock are insert and delete. Nothing to update.
grant select, insert, delete on blocks to authenticated;

-- invitations: READ ONLY for clients. Sending consults a block list the sender
-- cannot read, and each transition has to notify the other party and enforce
-- that the sender may only cancel while the recipient may reschedule.
-- Comparing the old row to the new one is beyond RLS, so rather than grant
-- writes and police them with a trigger, no write is offered here at all.
grant select on invitations to authenticated;

-- link_codes: a user may see and revoke their own. Minting needs
-- unguessability; redeeming reads someone else's row. Both are functions.
grant select, delete on link_codes to authenticated;
