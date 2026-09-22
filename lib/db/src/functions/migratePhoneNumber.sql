-- migrate_phone_number(phone_hash) - collision recovery, "this is still me"
-- branch. Companion to reset_phone_number() - see that file for the shared
-- rationale on why this exists ahead of OTP and how it is trusted/reviewed.
--
-- MIGRATE keeps the OLD account's history under THIS caller's new identity,
-- rather than discarding it. It cannot simply reuse the old row: users.id IS
-- the Supabase auth identity (every RLS policy on this table is literally
-- `id = auth.uid()`), and a new device/install always has its own fresh
-- auth.uid() - there is no operation that hands an existing row to a
-- different auth identity's id. So this function re-points every row that
-- referenced the OLD id onto the CALLER's id, then deletes the now-empty old
-- row, then lets the caller claim the number.
--
-- devices deliberately do NOT carry over - see devices.ts's own header: a
-- rebind revoking old device rows is the one signal a real owner gets that
-- their account moved, and an old device's push token is stale on a new
-- physical install regardless.
--
-- blocks needs conflict handling that invitations does not: it has a
-- composite primary key (blocker_id, blocked_id), so if the caller's NEW
-- account already blocked (or was blocked by) the same person the old
-- account also had a row for, re-pointing the old row would violate that
-- primary key. ON CONFLICT DO NOTHING keeps the caller's own existing block
-- rather than erroring - either row already expresses "don't let this person
-- remind me", so which one wins is immaterial.
--
-- SECURITY DEFINER / search_path pin / schema-qualification: same as every
-- other function in this risk class, and for the same reason - finding the
-- old account by phone_hash rather than by an id the caller could assert
-- directly is what stops this from letting a caller take over an arbitrary
-- account's history by guessing its uuid.
--
-- ORDER MATTERS: blocks and invitations are re-pointed, and the old row
-- deleted, in ONE transaction (the function body) before the final insert
-- claims the number - so a crash or error partway through cannot leave the
-- number simultaneously unclaimed and the old account's data half-migrated.
-- Postgres rolls the whole function back on any exception.
create or replace function public.migrate_phone_number(p_phone_hash text)
returns setof public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  old_id uuid;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_phone_hash is null or length(p_phone_hash) = 0 then
    raise exception 'phone_hash required' using errcode = 'P0002';
  end if;

  -- No-op, not an error, if the caller already owns this exact number.
  if exists (select 1 from public.users u where u.id = caller and u.phone_hash = p_phone_hash) then
    return query select * from public.users where id = caller;
    return;
  end if;

  select u.id into old_id from public.users u where u.phone_hash = p_phone_hash and u.id <> caller;

  if old_id is not null then
    -- The caller's own row must exist BEFORE anything is re-pointed onto its
    -- id, or the invitations/blocks foreign keys reject the update outright.
    -- Its phone_hash is set to a placeholder that cannot collide with a real
    -- E.164-derived hash (this function's own p_phone_hash argument always
    -- is one) and is overwritten with the real value below, after the old
    -- row - the only thing that could still hold p_phone_hash - is gone.
    insert into public.users (id, phone_hash)
    values (caller, '__migrating__' || caller::text)
    on conflict (id) do nothing;

    update public.invitations i set sender_id = caller where i.sender_id = old_id;
    update public.invitations i set recipient_id = caller where i.recipient_id = old_id;

    update public.blocks b set blocker_id = caller
     where b.blocker_id = old_id
       and not exists (
         select 1 from public.blocks b2 where b2.blocker_id = caller and b2.blocked_id = b.blocked_id
       );
    update public.blocks b set blocked_id = caller
     where b.blocked_id = old_id
       and not exists (
         select 1 from public.blocks b2 where b2.blocker_id = b.blocker_id and b2.blocked_id = caller
       );
    -- Whatever could not be re-pointed above (the caller already had the
    -- equivalent row) is leftover old-account cruft, cleared by the delete
    -- below via cascade - not left behind as an orphan.

    delete from public.users u where u.id = old_id;
  end if;

  insert into public.users (id, phone_hash)
  values (caller, p_phone_hash)
  on conflict (id) do update
    set phone_hash = excluded.phone_hash,
        last_active_at = now();

  return query select * from public.users where id = caller;
end;
$$;

revoke all on function public.migrate_phone_number(text) from public, anon, authenticated;
grant execute on function public.migrate_phone_number(text) to authenticated;
