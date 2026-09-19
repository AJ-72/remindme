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
--
-- Short-term phone-migration fix (found in a subsequent bug hunt): a user
-- who moves to a new phone gets a brand-new auth.uid() and could not
-- self-register their own number again, because the OLD account (tied to
-- the old device's auth identity) still held it - permanently, since this
-- function had no path to ever let it go. The full fix is the design's
-- planned 45-day OTP rebind window (T2.6/T2.3, see
-- docs/superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md,
-- "Reinstall, migration, and recycled numbers"), which is not buildable yet
-- - OTP itself is deferred. Until then, this reuses the SAME 45-day floor
-- and the SAME users.last_active_at column that window is meant to read,
-- but only for the FRESH-account half of that design: a number belonging to
-- an account untouched for 45+ days is treated as abandoned/recycled, the
-- old row (and, by cascade, its devices/blocks/invitations) is deleted, and
-- the caller gets a brand-new account under that number. It deliberately
-- does NOT recover the old account's blocks or links onto the new caller -
-- self_register() has no proof of identity at all, so carrying a stranger's
-- block list onto whoever next types the same digits would be a worse bug
-- than the one this fixes. A number still active within 45 days keeps the
-- original refusal unchanged.
create or replace function public.self_register(p_phone_hash text)
returns setof public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  existing_id uuid;
  existing_last_active timestamptz;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_phone_hash is null or length(p_phone_hash) = 0 then
    raise exception 'phone_hash required' using errcode = 'P0002';
  end if;

  -- Locks the row (if any) so a second caller racing the same stale
  -- phone_hash blocks here rather than also passing this check - it will
  -- see the row already gone once this transaction commits, and fall
  -- through to the insert's own unique-constraint failure instead of a
  -- silent double-claim.
  select u.id, u.last_active_at into existing_id, existing_last_active
    from public.users u
   where u.id <> caller and u.phone_hash = p_phone_hash
   for update;

  if existing_id is not null then
    if existing_last_active > now() - interval '45 days' then
      raise exception 'number already registered to a different account' using errcode = 'P0001';
    end if;

    delete from public.users where id = existing_id;
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
