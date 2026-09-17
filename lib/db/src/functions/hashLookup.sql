-- hash_lookup(phone_hash) - "does this number have the app?"
--
-- Reads users, a table RLS restricts to `id = auth.uid()` (users_select_self)
-- - by design, since bulk-readable phone hashes would be a contact-list leak.
-- Any other caller reaching a row belonging to someone else has to go through
-- exactly this function, which is why it is the narrowest possible interface:
-- one boolean, one opaque id, nothing else about the person. No display_name,
-- no discoverable flag, no accepting_reminders. T3.2 (multi-dimensional rate
-- limiting, applied in the calling Edge Function, not here) is what stops
-- this from being an enumeration oracle over every number in India - this
-- function on its own is a plain, unthrottled read.
--
-- "Does this number have the app" must also answer false for a registered but
-- NOT discoverable user, and false for the caller's own hash (self is never a
-- meaningful lookup result) - both folded into the WHERE clause rather than
-- handled by the caller, so no Edge Function can forget either check.

create or replace function public.hash_lookup(lookup_hash text)
returns table(app_user_id uuid, "exists" boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  found uuid;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select u.id into found
    from public.users u
   where u.phone_hash = lookup_hash
     and u.discoverable
     and u.id <> caller
   limit 1;

  if found is null then
    return query select null::uuid, false;
  else
    return query select found, true;
  end if;
end;
$$;

-- Same Supabase default-privilege gotcha as claim_invitations/
-- bind_via_invite_token: `revoke ... from public` alone leaves `anon` and
-- `authenticated` with an implicit EXECUTE grant on this project. Name both
-- explicitly.
revoke all on function public.hash_lookup(text) from public, anon, authenticated;
grant execute on function public.hash_lookup(text) to authenticated;
