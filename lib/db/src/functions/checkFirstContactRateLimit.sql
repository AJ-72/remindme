-- check_first_contact_rate_limit(sender_id, recipient_hash) - T4.6.
--
-- Distinct from T3.2's lookup rate limit: this caps how many NEW people a
-- sender can message in a day (10), not how many lookups they run. Messaging
-- someone already invited is unlimited by this check - established contact
-- is not the enumeration/spam risk a stranger blast is.
--
-- Reads invitations, which RLS restricts to sender_id = auth.uid() or
-- recipient_id = auth.uid() - fine for the sender's own outbound history,
-- which is exactly what this needs, so this does not strictly need to be
-- SECURITY DEFINER for the read. It IS one anyway, matching every other
-- server-side check in this file, so it can be called from send_invitation
-- (also SECURITY DEFINER) without a nested-privilege surprise, and so a
-- future caller of this function alone gets the same guarantee.

create or replace function public.check_first_contact_rate_limit(
  p_sender_id uuid,
  p_recipient_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  already_contacted boolean;
  distinct_new_today int;
begin
  if auth.uid() is null or auth.uid() <> p_sender_id then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select exists(
    select 1 from public.invitations i
     where i.sender_id = p_sender_id and i.recipient_phone_hash = p_recipient_hash
  ) into already_contacted;

  if already_contacted then
    return true;
  end if;

  select count(distinct recipient_phone_hash) into distinct_new_today
    from public.invitations
   where sender_id = p_sender_id
     and created_at > now() - interval '1 day';

  return distinct_new_today < 10;
end;
$$;

revoke all on function public.check_first_contact_rate_limit(uuid, text) from public, anon, authenticated;
grant execute on function public.check_first_contact_rate_limit(uuid, text) to authenticated;
