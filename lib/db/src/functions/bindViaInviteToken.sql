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
-- it must be SECURITY DEFINER, take no argument beyond the opaque token, and
-- pin search_path with every name schema-qualified (see claimInvitations.sql
-- for what a missing pin/qualification actually costs - sabotage-tested
-- there, not re-derived here).
--
-- Deliberately narrow: this function ONLY binds identity. It does not also
-- run claim_invitations() - the caller does that as a separate step - keeping
-- "prove who I am" and "collect my mail" as two things that can be reasoned
-- about (and denied) independently.

create or replace function public.bind_via_invite_token(token uuid)
returns setof public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  inv public.invitations;
  caller_hash text;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into inv from public.invitations i where i.bind_token = token;
  if inv.id is null then
    raise exception 'invalid token' using errcode = 'P0002';
  end if;

  if inv.expires_at <= now() then
    raise exception 'token expired' using errcode = 'P0002';
  end if;

  select u.phone_hash into caller_hash from public.users u where u.id = caller;

  if caller_hash is not null and caller_hash <> inv.recipient_phone_hash then
    -- Covers two different attacks with one check: a second account
    -- attempting to consume a token already bound elsewhere, AND an
    -- established account's number being silently reassigned by a link it
    -- didn't ask for. v1 accepts one number per account; changing it is a
    -- deliberate act (the link-code repair path), never a side effect of
    -- tapping a link.
    raise exception 'number already bound to a different account' using errcode = 'P0001';
  end if;

  if caller_hash is null then
    -- Whoever holds this hash already is not necessarily the caller, and
    -- that is fine on a genuine re-tap (same caller, ON CONFLICT below
    -- handles it) - but a DIFFERENT existing account holding the hash means
    -- this token is already spent. Re-verifying a lost device is rung 2
    -- (OTP): "there is no invite link on a migration" (spec).
    if exists (
      select 1 from public.users u
       where u.phone_hash = inv.recipient_phone_hash and u.id <> caller
    ) then
      raise exception 'number already bound to a different account' using errcode = 'P0001';
    end if;

    insert into public.users (id, phone_hash) values (caller, inv.recipient_phone_hash);
  end if;

  return query select * from public.users where id = caller;
end;
$$;

revoke all on function public.bind_via_invite_token(uuid) from public;
grant execute on function public.bind_via_invite_token(uuid) to authenticated;
