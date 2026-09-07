-- claim_invitations() - hand a newly registered user the mail addressed to
-- their number.
--
-- THE MOST ATTACK-EXPOSED CODE IN THIS DESIGN. Review it as such.
--
-- Why it cannot be ordinary RLS: an unclaimed invitation is owned by nobody
-- (recipient_id is null), so no row-ownership policy can reach it. And any
-- policy that could - "show me rows for this hash" - would be an enumeration
-- oracle answering "is this number registered?" for every number in India.
--
-- Two properties carry the whole thing:
--
-- 1. IT TAKES NO ARGUMENT. The caller cannot say which number to claim; the
--    function reads their own users.phone_hash. That column is writable only
--    by the verified bind operation (see privileges.sql), so possession of a
--    number is proven before this function is ever reachable. An argument
--    here would reinstate the exact defect the first draft of the spec
--    shipped: register with someone else's number, self-claim their mail, and
--    - because phone_hash is UNIQUE - lock the real owner out permanently.
--
-- 2. search_path IS PINNED AND EVERY NAME IS SCHEMA-QUALIFIED. A SECURITY
--    DEFINER function runs as its owner and so bypasses RLS entirely. Without
--    a pinned search_path the caller could put their own `invitations` table
--    earlier on the path and have this function read it with the owner's
--    privileges. (pg_catalog is always searched first regardless, so now()
--    cannot be shadowed.)
--
-- What it deliberately does NOT do: set a status. Claiming only says "this
-- mail is yours"; accept and decline are the recipient's own decisions,
-- taken later.

create or replace function public.claim_invitations()
returns setof public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_hash text;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- One lookup does three jobs: proves the account exists, fetches the hash
  -- the caller is entitled to, and enforces the global mute. Folding the mute
  -- in here means "don't let anyone remind me" also covers mail that arrived
  -- before the switch was flipped - otherwise the mute reads as broken the
  -- moment it is turned on. Those rows are left alone and expire by themselves.
  select u.phone_hash into caller_hash
    from public.users u
   where u.id = caller
     and u.accepting_reminders;

  if caller_hash is null then
    return;
  end if;

  -- `recipient_id is null` in the WHERE is also the concurrency control: two
  -- devices claiming at once serialise on the row lock, and the loser matches
  -- nothing. That is what makes a repeat call a silent no-op rather than a
  -- duplicate or an error - and people do tap twice.
  return query
    update public.invitations i
       set recipient_id = caller,
           updated_at = now()
     where i.recipient_phone_hash = caller_hash
       and i.recipient_id is null
       and i.status = 'invited'
       and i.expires_at > now()
       -- Content is nulled at content_expires_at (30 days at the outside),
       -- while the row itself lives until its datetime. A row past that point
       -- can only produce an empty reminder.
       --
       -- It also narrows a real gap: an unclaimed invitation has a null
       -- recipient_id and so does NOT cascade when the account for that
       -- number is deleted, which would otherwise let a recycled number's new
       -- owner claim mail addressed to its previous holder. Carrier recycling
       -- takes 45+ days and content is gone by 30, so this covers the
       -- realistic case. The complete fix is purging unclaimed rows for a
       -- hash when a FRESH account binds it, which belongs in bind.
       and i.content_expires_at > now()
    returning i.*;
end;
$$;

-- Default EXECUTE on a new function is PUBLIC, which on a SECURITY DEFINER
-- function means anyone at all runs it as the owner. Revoke first, then grant
-- narrowly. anon is never given it: an unauthenticated caller has no number.
revoke all on function public.claim_invitations() from public;
grant execute on function public.claim_invitations() to authenticated;
