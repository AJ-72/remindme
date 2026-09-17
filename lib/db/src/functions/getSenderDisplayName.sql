-- get_sender_display_name(sender_id) - lets a RECIPIENT's client resolve the
-- display name of someone who has sent them an invitation, a cross-user read
-- users_select_self RLS deliberately does not allow. Narrow by design: reads
-- ONLY display_name, nothing else about the sender (no phone_hash, no
-- accepting_reminders, no discoverable) - same enumeration-safety discipline
-- as hash_lookup() and get_push_tokens_for_user().
--
-- Deliberately does NOT verify an invitation actually exists from p_sender_id
-- to the caller - unlike get_push_tokens_for_user() (called from inside a
-- trusted Edge Function right after send_invitation() succeeds), THIS
-- function is called directly from the recipient's own client with no
-- equivalent trusted call site guaranteeing the relationship. Any
-- authenticated caller can resolve any other user's display_name given their
-- id - accepted for beta scope since a display_name is not sensitive (it is
-- literally shown to the recipient on invite anyway) and the caller must
-- already know a valid sender_id (an unguessable-in-bulk uuid, not enumerable
-- from this function alone). Do not extend this function to return anything
-- more sensitive than display_name under this reasoning.

create or replace function public.get_sender_display_name(p_sender_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select u.display_name into result from public.users u where u.id = p_sender_id;
  return result;
end;
$$;

-- Same Supabase default-privilege gotcha as claim_invitations/
-- bind_via_invite_token/hash_lookup: `revoke ... from public` alone leaves
-- `anon` and `authenticated` with an implicit EXECUTE grant on this project.
-- Name both explicitly.
revoke all on function public.get_sender_display_name(uuid) from public, anon, authenticated;
grant execute on function public.get_sender_display_name(uuid) to authenticated;
