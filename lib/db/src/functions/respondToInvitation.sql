-- respond_to_invitation(invitation_id, response) - T5.1-T5.3.
--
-- Accept and decline are the recipient's own decisions (see
-- claim_invitations()'s header: claiming only says "this mail is yours",
-- this function is where the actual decision is taken). Content is nulled
-- on EITHER response, not just accept - a declined invitation has no more
-- reason to retain title/description than an accepted one does, and the row
-- survives regardless so "it never arrived" / "it was declined" stay
-- debuggable from status + timestamps alone (T5.2).
--
-- "Never overload decline with never again" (T5.3) - this function has no
-- opinion about future sends from this sender; blocking is a separate
-- action on a separate table (blocks), left entirely alone here.

create or replace function public.respond_to_invitation(
  p_invitation_id uuid,
  p_response text
)
returns setof public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  updated public.invitations;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_response not in ('accepted', 'declined') then
    raise exception 'invalid response' using errcode = 'P0001';
  end if;

  update public.invitations i
     set status = p_response::public.invitation_status,
         title = null,
         description = null,
         terminal_at = now(),
         updated_at = now()
   where i.id = p_invitation_id
     and i.recipient_id = caller
     and i.status = 'invited'
  returning * into updated;

  if updated.id is null then
    raise exception 'invitation not found, not yours, or already responded to' using errcode = 'P0002';
  end if;

  return query select * from public.invitations where id = updated.id;
end;
$$;

-- Default EXECUTE on a new function is PUBLIC, which on a SECURITY DEFINER
-- function means anyone at all runs it as the owner. Revoke first, then grant
-- narrowly. `from public` alone is NOT enough on Supabase - see
-- claimInvitations.sql's header for the confirmed 2026-09-07 finding; name
-- every role explicitly instead.
revoke all on function public.respond_to_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.respond_to_invitation(uuid, text) to authenticated;
