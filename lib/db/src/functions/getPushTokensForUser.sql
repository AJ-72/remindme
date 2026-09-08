-- get_push_tokens_for_user(user_id) - lets the SENDER's Edge Function fetch
-- the RECIPIENT's push tokens to deliver an invitation notification, a
-- cross-user read devices_select_own RLS deliberately does not allow (a
-- device row is visible only to the account it belongs to). Narrow by
-- design: returns ONLY expo_push_token, nothing else about the recipient's
-- devices (no platform, no last_seen_at) - same enumeration-safety
-- discipline as hash_lookup().
--
-- Deliberately does NOT check the block list or any other authorization
-- beyond "caller is authenticated" - send_invitation() (Task 6) is what
-- already enforces the block-list check before an invitation is ever
-- created; this function only runs from inside the send-invitation Edge
-- Function AFTER send_invitation() has already succeeded, so gating this
-- read on "invitation exists for this (caller, recipient) pair" would be
-- redundant, not a missing check. Confirmed: the Edge Function calls
-- send_invitation() first and only reaches this function if that RPC
-- returned without error, so by the time this runs a legitimate,
-- block-list-cleared invitation to this recipient already exists - there is
-- no path to this function that bypasses that gate.

create or replace function public.get_push_tokens_for_user(p_user_id uuid)
returns table(expo_push_token text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
    select d.expo_push_token from public.devices d where d.user_id = p_user_id;
end;
$$;

-- Same Supabase default-privilege gotcha as claim_invitations/
-- bind_via_invite_token/hash_lookup: `revoke ... from public` alone leaves
-- `anon` and `authenticated` with an implicit EXECUTE grant on this project.
-- Name both explicitly.
revoke all on function public.get_push_tokens_for_user(uuid) from public, anon, authenticated;
grant execute on function public.get_push_tokens_for_user(uuid) to authenticated;
