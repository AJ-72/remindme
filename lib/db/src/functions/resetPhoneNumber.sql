-- reset_phone_number(phone_hash) - collision recovery, "start fresh" branch.
--
-- Companion to migrate_phone_number() (see that file for the "keep my
-- history" branch and the shared design rationale). Both exist because
-- self_register() hard-refuses a phone_hash already owned by a different
-- account, and OTP verification (the eventual, principled fix - see
-- roadmap.md's 45-day rebind design) is still deferred. Until it lands,
-- registration cannot tell "this is genuinely my old number, I lost that
-- device" apart from "someone else already has this number" - so this
-- function trusts the caller's assertion the same way self_register() always
-- has, and is reviewed as the same risk class.
--
-- RESET deletes the OLD account outright: every row referencing it
-- (invitations sent or received, devices, blocks - all FKs to users.id are
-- ON DELETE CASCADE) is gone, then this caller registers the number fresh.
-- This is the right choice when the caller does not want the old account's
-- history, or suspects the old account isn't really theirs and wants the
-- number cleaned up rather than inherited. Irreversible - there is no undo
-- once the old row is gone, which is why the client must confirm this
-- explicitly and never default to it over migrate.
--
-- SECURITY DEFINER because deleting an arbitrary users row (found by
-- phone_hash, not by id - the caller has no standing to name another
-- account's id directly) crosses a boundary RLS's `id = auth.uid()` policies
-- do not open. search_path pinned and every name schema-qualified, same as
-- every other function in this file's risk class.
--
-- ONE ATOMIC STATEMENT for the state change: the delete's WHERE clause
-- (phone_hash match, id <> caller) is what a concurrent racer would also have
-- to satisfy, so two callers racing the same number cannot both "win" a stale
-- view of which row still exists - whichever delete commits first removes the
-- row the second one's WHERE can no longer match, and it deletes zero rows
-- rather than erroring, which is fine: the subsequent insert below still
-- proceeds and free-for-all wins are exactly what should happen when nobody
-- has a durable claim (no OTP means there IS no durable claim yet).
create or replace function public.reset_phone_number(p_phone_hash text)
returns setof public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_phone_hash is null or length(p_phone_hash) = 0 then
    raise exception 'phone_hash required' using errcode = 'P0002';
  end if;

  -- No-op, not an error, if the caller already owns this exact number -
  -- matches self_register()'s own idempotence and means a retried/duplicate
  -- client call cannot delete the caller's own just-created account.
  if exists (select 1 from public.users u where u.id = caller and u.phone_hash = p_phone_hash) then
    return query select * from public.users where id = caller;
    return;
  end if;

  delete from public.users u where u.id <> caller and u.phone_hash = p_phone_hash;

  insert into public.users (id, phone_hash)
  values (caller, p_phone_hash)
  on conflict (id) do update
    set phone_hash = excluded.phone_hash,
        last_active_at = now();

  return query select * from public.users where id = caller;
end;
$$;

-- `from public` alone is not enough on Supabase - see bindViaInviteToken.sql
-- for why every role must be named explicitly, confirmed live 2026-09-07.
revoke all on function public.reset_phone_number(text) from public, anon, authenticated;
grant execute on function public.reset_phone_number(text) to authenticated;
