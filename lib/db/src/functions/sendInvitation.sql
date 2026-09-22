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

-- M2 Task 5c: an optional p_recurrence jsonb parameter, default null (one-
-- shot, matching the client's own "absent means one-shot" convention). The
-- server never re-sends or re-schedules from it - the recipient accepts
-- ONCE and the series then lives entirely on her device (see invitations.ts'
-- own header). Validated server-side because it crosses a trust boundary
-- (another user's client -> this row -> the recipient's own notification
-- schedule): interval must be a positive integer, freq must be one of the
-- four the mobile client's RecurrenceRule supports. Changing this
-- function's signature needs the old one dropped first, or both overloads
-- survive and callers bind unpredictably (see respond_to_invitation.sql's
-- own comment on this).
drop function if exists public.send_invitation(uuid, text, text, timestamptz);

create or replace function public.send_invitation(
  p_recipient_app_user_id uuid,
  p_title text,
  p_description text,
  p_datetime timestamptz,
  p_recurrence jsonb default null
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

  if p_recurrence is not null then
    if jsonb_typeof(p_recurrence) is distinct from 'object' then
      raise exception 'malformed recurrence rule' using errcode = '22023';
    end if;
    -- `not (x = any(...))` is NULL, not TRUE, when x itself is NULL (SQL's
    -- three-valued logic) - a rule missing "freq" entirely would otherwise
    -- silently pass this check instead of being rejected. `is distinct from
    -- true` treats a NULL comparison result as a failure, closing that gap.
    if ((p_recurrence ->> 'freq') = any (array['daily', 'weekly', 'monthly', 'yearly']))
       is distinct from true then
      raise exception 'unknown recurrence frequency' using errcode = '22023';
    end if;
    if ((p_recurrence ->> 'interval') ~ '^[0-9]+$'
        and (p_recurrence ->> 'interval')::int >= 1) is distinct from true then
      raise exception 'recurrence interval must be a positive integer' using errcode = '22023';
    end if;
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

  if not public.check_first_contact_rate_limit(caller, recipient_hash) then
    raise exception 'too many new contacts today' using errcode = 'P0001';
  end if;

  insert into public.invitations (
    sender_id, recipient_phone_hash, title, description,
    datetime, original_datetime, expires_at, content_expires_at, recurrence
  ) values (
    caller, recipient_hash, p_title, p_description,
    p_datetime, p_datetime, p_datetime,
    least(p_datetime, now() + interval '30 days'),
    p_recurrence
  )
  returning * into new_row;

  return query select * from public.invitations where id = new_row.id;
end;
$$;

revoke all on function public.send_invitation(uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.send_invitation(uuid, text, text, timestamptz, jsonb) to authenticated;
