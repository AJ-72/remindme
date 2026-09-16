-- get_sender_push_tokens(invitation_id) - the mirror image of
-- get_push_tokens_for_user(): lets the RECIPIENT's respond-invitation call
-- fetch the SENDER's push tokens, to tell the sender their reminder's time
-- was moved on accept. get_push_tokens_for_user() cannot be reused here -
-- its in-body check requires the CALLER to be the one who sent an
-- invitation to the target, which is exactly backwards for this direction.
--
-- Scoped to one specific invitation rather than an arbitrary sender id, on
-- the same "no path that bypasses the real relationship check" discipline
-- as get_push_tokens_for_user()'s own Fix 3 (see that file's header): the
-- caller must be the recipient ON THAT ROW, which is a relationship they
-- cannot spoof (recipient_id is set by claim/bind, never client-writable -
-- see invitations.ts and privileges.sql).

create or replace function public.get_sender_push_tokens(p_invitation_id uuid)
returns table(expo_push_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_sender uuid;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select i.sender_id into target_sender
    from public.invitations i
   where i.id = p_invitation_id
     and i.recipient_id = caller;

  if target_sender is null then
    raise exception 'no such invitation for this caller' using errcode = '28000';
  end if;

  return query
    select d.expo_push_token from public.devices d where d.user_id = target_sender;
end;
$$;

-- Same Supabase default-privilege gotcha as every other SECURITY DEFINER
-- function here - `revoke ... from public` alone leaves `anon` and
-- `authenticated` with an implicit EXECUTE grant on this project. Name both
-- explicitly.
revoke all on function public.get_sender_push_tokens(uuid) from public, anon, authenticated;
grant execute on function public.get_sender_push_tokens(uuid) to authenticated;
