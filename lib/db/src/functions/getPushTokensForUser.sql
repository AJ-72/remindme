-- get_push_tokens_for_user(user_id) - lets the SENDER's Edge Function fetch
-- the RECIPIENT's push tokens to deliver an invitation notification, a
-- cross-user read devices_select_own RLS deliberately does not allow (a
-- device row is visible only to the account it belongs to). Narrow by
-- design: returns ONLY expo_push_token, nothing else about the recipient's
-- devices (no platform, no last_seen_at) - same enumeration-safety
-- discipline as hash_lookup().
--
-- Final-review Fix 3 (2026-09-08 plan, Task 16): this function's actual
-- authorization surface is LIVE, not theoretical - any `authenticated`
-- caller can invoke it directly via supabase-js's general RPC client (which
-- exists per Task 10's getSupabaseClient()), for any p_user_id, with no
-- relationship check and no rate limit. An earlier version of this comment
-- claimed "there is no path to this function that bypasses" the
-- send_invitation() gate; that was false as written - it only described
-- how the Edge Function happens to call it, not what the function itself
-- enforces. Fixed here by adding an in-body check: the caller must have an
-- existing invitation TO the target user's phone hash - i.e. the caller has
-- actually sent something to this person, which is exactly the trust
-- relationship the original design intended to rely on implicitly. The
-- send-invitation Edge Function's own call still passes: by the time it
-- calls this function, send_invitation() has already inserted the
-- (caller, recipient-hash) invitation row this check looks for.

create or replace function public.get_push_tokens_for_user(p_user_id uuid)
returns table(expo_push_token text)
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

  if not exists (
    select 1 from public.invitations i
    where i.sender_id = caller
      and i.recipient_phone_hash = (select u.phone_hash from public.users u where u.id = p_user_id)
  ) then
    raise exception 'no invitation relationship' using errcode = '28000';
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
