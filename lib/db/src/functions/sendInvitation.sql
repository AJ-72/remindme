-- send_invitation(recipient_app_user_id, title, description, datetime) - T4.1/T4.2.
--
-- invitations is READ-ONLY to clients (Phase 1 finding: sending has to
-- consult a block list the sender cannot read, per blocks' own RLS which
-- keys everything on blocker_id and grants the blocked party no visibility
-- of it - see blocks.ts). So creation is necessarily a server function, and
-- this is the one enforcement point for both rules that RLS structurally
-- cannot express here: the block check, and the 30-day content-retention cap
-- as `least(datetime, now() + 30 days)` rather than a predicate a cleanup job
-- has to compute correctly later.
--
-- Takes an APP USER ID, not a phone hash - the client already resolved the
-- recipient via the lookup Edge Function's opaque id, and must never be
-- trusted to assert an arbitrary hash string directly (that would let a
-- caller address mail to a hash without having gone through discoverability/
-- lookup rules at all). The hash actually written is read fresh from
-- `users.phone_hash` for that id, so the DB - not the client - is
-- authoritative for the id-to-hash mapping at send time.

create or replace function public.send_invitation(
  p_recipient_app_user_id uuid,
  p_title text,
  p_description text,
  p_datetime timestamptz
)
returns setof public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  recipient_hash text;
  new_row public.invitations;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select u.phone_hash into recipient_hash
    from public.users u
   where u.id = p_recipient_app_user_id;

  if recipient_hash is null then
    raise exception 'recipient not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.blocks b
     where b.blocker_id = p_recipient_app_user_id
       and b.blocked_id = caller
  ) then
    raise exception 'recipient is not accepting reminders from you' using errcode = 'P0001';
  end if;

  insert into public.invitations (
    sender_id, recipient_phone_hash, title, description,
    datetime, original_datetime, expires_at, content_expires_at
  ) values (
    caller, recipient_hash, p_title, p_description,
    p_datetime, p_datetime, p_datetime,
    least(p_datetime, now() + interval '30 days')
  )
  returning * into new_row;

  return query select * from public.invitations where id = new_row.id;
end;
$$;

revoke all on function public.send_invitation(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.send_invitation(uuid, text, text, timestamptz) to authenticated;
