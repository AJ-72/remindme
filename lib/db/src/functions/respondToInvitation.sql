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
--
-- p_accepted_datetime (added for the "notify sender the receiver moved the
-- time" feature): the ONLY thing an accept may change about `datetime`, and
-- only on accept - a decline leaves it untouched. `original_datetime` is
-- deliberately never touched here either: it already exists to answer "what
-- did the sender originally ask for", which is exactly what the caller
-- needs to diff against the new `datetime` to detect a change and decide
-- whether to push the sender at all. Reusing that column instead of adding
-- a new one keeps this a function-only change, no new schema migration.
drop function if exists public.respond_to_invitation(uuid, text);

create or replace function public.respond_to_invitation(
  p_invitation_id uuid,
  p_response text,
  p_accepted_datetime timestamptz default null
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
         updated_at = now(),
         datetime = case
           when p_response = 'accepted' and p_accepted_datetime is not null
             then p_accepted_datetime
           else i.datetime
         end
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
revoke all on function public.respond_to_invitation(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.respond_to_invitation(uuid, text, timestamptz) to authenticated;
