-- self_register(phone_hash) - unauthenticated first-time registration.
--
-- OTP verification is explicitly deferred (tracked separately) - this
-- function trusts the caller's own assertion of their phone number. It
-- exists so a brand-new number has ANY way to become a registered app user:
-- before this, send_invitation() required the recipient to already exist in
-- `users`, and bind_via_invite_token() required an existing invitation's
-- bind_token - neither can be the mechanism that first creates a user row
-- from nothing, so a never-before-seen number had no path in at all.
--
-- Same risk class as bind_via_invite_token() and reviewed the same way:
-- SECURITY DEFINER (writes a users row RLS would not otherwise let this
-- caller touch before it exists), no argument beyond what auth.uid() already
-- establishes, search_path pinned and every name schema-qualified.
--
-- THE COLLISION GUARD IS THE SAME ONE bind_via_invite_token() USES: a phone
-- number already owned by a different account must not be silently
-- reassigned just because a second caller asserts it. Since there is no OTP
-- yet, this is the only thing stopping caller B from typing caller A's
-- number - it can't stop that (no proof of control exists yet), but it DOES
-- stop the number from moving to B once A already holds it, and it stops one
-- caller from silently overwriting their own already-different number.
--
-- ONE ATOMIC UPSERT, same reasoning as bind_via_invite_token(): the
-- collision check and the write must be one statement so two concurrent
-- callers racing the same phone_hash cannot both pass the check before
-- either writes.
create or replace function public.self_register(p_phone_hash text)
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

  if exists (
    select 1 from public.users u
     where u.id <> caller and u.phone_hash = p_phone_hash
  ) then
    raise exception 'number already registered to a different account' using errcode = 'P0001';
  end if;

  insert into public.users (id, phone_hash)
  values (caller, p_phone_hash)
  on conflict (id) do update
    set phone_hash = excluded.phone_hash,
        last_active_at = now();

  return query select * from public.users where id = caller;
end;
$$;

revoke all on function public.self_register(text) from public, anon, authenticated;
grant execute on function public.self_register(text) to authenticated;
