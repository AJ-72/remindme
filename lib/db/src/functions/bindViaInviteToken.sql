-- bind_via_invite_token(token) - rung 1 of the verification ladder.
--
-- Possession of the link carrying `token` IS proof of number control, since
-- WhatsApp/SMS delivered it to the invitation's recipient_phone_hash. This is
-- what removes the OTP screen from the user who can least absorb it: Amma
-- taps Anand's link and is bound silently.
--
-- Structurally the same risk class as claim_invitations() and reviewed with
-- the same scrutiny: it reads a row (the invitation, and potentially the
-- caller's own not-yet-existing user row) that ordinary RLS cannot reach, so
-- it must be SECURITY DEFINER, take no argument the caller could lie about
-- (the token is possessed, not asserted), and pin search_path with every name
-- schema-qualified (see claimInvitations.sql for what a missing pin and
-- qualification actually cost - sabotage-tested there, not re-derived here,
-- and the sabotage pass on THIS function found the qualification test was not
-- actually exercising the hijack - see bindViaInviteToken.test.ts).
--
-- Deliberately narrow: this function ONLY binds identity. It does not also
-- run claim_invitations() - the caller does that as a separate step - keeping
-- "prove who I am" and "collect my mail" as two things that can be reasoned
-- about (and denied) independently.
--
-- SINGLE-USE IS ENFORCED BY invitations.bound_by, NOT BY users.phone_hash
-- BEING UNIQUE. An earlier version inferred "this token is spent" from
-- whether some users row already held the invitation's hash. That proxy dies
-- with the account: bind and claim are separate (recipient_id stays null
-- after a bind), so the invitation does not cascade when the binder later
-- deletes their account (a Play Store requirement) - and the very same token
-- would then bind cleanly to a stranger. bound_by/bound_at is a fact about
-- the INVITATION, survives the account's deletion, and is what makes the
-- credential actually single-use rather than single-use-until-someone-deletes-
-- their-account.
--
-- THE CLAIM IS ONE ATOMIC UPDATE, NOT A SELECT FOLLOWED BY AN INSERT. Two
-- concurrent callers racing the same token must not both win: the UPDATE's
-- row lock is what serializes them. The second transaction blocks until the
-- first commits, then re-evaluates its WHERE clause against the now-committed
-- row - so it sees bound_by already set to someone else and matches nothing.
-- A single SELECT-then-branch version (which this function's own first draft
-- was) has no such lock and both callers can pass their checks before either
-- writes, which the PGlite test harness cannot catch since it runs one
-- transaction at a time - reason about this from Postgres MVCC semantics, not
-- from the test suite going green.

create or replace function public.bind_via_invite_token(token uuid)
returns setof public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  inv public.invitations;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The single state-changing statement. Its WHERE clause folds in every
  -- security-relevant condition so nothing is checked, found valid, and then
  -- invalidated by a concurrent writer before this transaction commits:
  --   - not yet bound, or already bound to this same caller (idempotent re-tap)
  --   - not past its own expiry or its content-retention cutoff
  --   - this caller holds no OTHER number already (one number per account in
  --     v1 - a mismatch here must abort the whole claim, not partially land it)
  --   - no OTHER account already holds this invitation's number (the mirror
  --     case: a stale/duplicate identity - e.g. a prior install of the same
  --     physical number - already claimed this phone_hash under a different
  --     id. Without this, the later INSERT ... on conflict (id) can't catch
  --     it either, since its conflict target is `id`, not `phone_hash` - it
  --     would fall through to a raw users_phone_hash_unique violation instead
  --     of this function's own "already bound" error)
  update public.invitations i
     set bound_by = caller,
         bound_at = now()
   where i.bind_token = token
     and (i.bound_by is null or i.bound_by = caller)
     and i.expires_at > now()
     and i.content_expires_at > now()
     and not exists (
       select 1 from public.users u
        where u.id = caller and u.phone_hash <> i.recipient_phone_hash
     )
     and not exists (
       select 1 from public.users u
        where u.id <> caller and u.phone_hash = i.recipient_phone_hash
     )
  returning i.* into inv;

  if inv.id is null then
    -- The claim did not land. Diagnose for a useful error - this is a plain
    -- read with no further writes, so it cannot itself race anything; the
    -- one and only state change already either happened or didn't, above.
    select * into inv from public.invitations i where i.bind_token = token;

    if inv.id is null then
      raise exception 'invalid token' using errcode = 'P0002';
    elsif inv.expires_at <= now() or inv.content_expires_at <= now() then
      raise exception 'token expired' using errcode = 'P0002';
    elsif inv.bound_by is not null and inv.bound_by <> caller then
      raise exception 'number already bound to a different account' using errcode = 'P0001';
    else
      -- Only remaining reasons the UPDATE's WHERE could have failed: either
      -- this caller already holds a different number than this token's, or a
      -- different account already holds THIS token's number (stale/duplicate
      -- identity on the same physical number). Same user-facing error either
      -- way - which account is "wrong" isn't this caller's business to know.
      raise exception 'number already bound to a different account' using errcode = 'P0001';
    end if;
  end if;

  -- Whether this account existed BEFORE this call determines whether this is
  -- a fresh bind (purge stale mail for the recycled hash) or a re-tap/rebind
  -- of an existing account (never purge - an established account's own
  -- pending mail must survive a repeat tap of the same link).
  declare
    was_fresh boolean;
  begin
    select not exists(select 1 from public.users u where u.id = caller)
      into was_fresh;

    -- last_active_at bumps on a re-tap too - a re-tap is an unambiguous "I am
    -- here" signal, and it is what the 45-day rebind window is measured from.
    insert into public.users (id, phone_hash)
    values (caller, inv.recipient_phone_hash)
    on conflict (id) do update set last_active_at = now();

    if was_fresh then
      -- T1.10: purge unclaimed invitations under this hash that predate this
      -- bind. A fresh account binding a recycled number must not inherit mail
      -- addressed to whoever held the number before - claim_invitations()'s
      -- content_expires_at guard only covers the 30+-day case; this closes
      -- the gap for a number recycled faster than that. The just-bound
      -- invitation itself (inv.id) is excluded - it is this caller's own mail,
      -- not stale mail from a predecessor.
      delete from public.invitations i
       where i.recipient_phone_hash = inv.recipient_phone_hash
         and i.recipient_id is null
         and i.id <> inv.id;
    end if;
  end;

  return query select * from public.users where id = caller;
end;
$$;

-- `from public` alone is NOT enough on Supabase: every new project ships an
-- ALTER DEFAULT PRIVILEGES that grants EXECUTE directly to `anon` and
-- `authenticated` on any function created in schema public by `postgres`/
-- `supabase_admin` - a grant to those roles by name, independent of the
-- PUBLIC pseudo-role, which `revoke ... from public` cannot touch. Confirmed
-- 2026-09-07 on the real project: anon had EXECUTE despite this line, saved
-- only by the in-body auth check above. Name every role explicitly instead.
revoke all on function public.bind_via_invite_token(uuid) from public, anon, authenticated;
grant execute on function public.bind_via_invite_token(uuid) to authenticated;
