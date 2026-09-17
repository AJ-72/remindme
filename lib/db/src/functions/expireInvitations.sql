-- expire_invitations() - T5.4. A maintenance sweep, not a user-triggered
-- operation: only service_role may call it (via the scheduled Edge Function,
-- not any client). "Sender told" is satisfied by the sender's own list
-- already reading invitations under invitations_select_involved RLS - this
-- function's only job is making status:'expired' true in the database at
-- the right moment; nothing here pushes anything to anyone.

create or replace function public.expire_invitations()
returns setof public.invitations
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and (current_setting('request.jwt.claims', true)::json->>'role') <> 'service_role' then
    raise exception 'service role only' using errcode = '42501';
  end if;

  return query
    update public.invitations i
       set status = 'expired',
           title = null,
           description = null,
           terminal_at = now(),
           updated_at = now()
     where i.status = 'invited'
       and i.expires_at <= now()
    returning i.*;
end;
$$;

-- Same Supabase default-privilege gotcha as every other SECURITY DEFINER
-- function here: `revoke ... from public` alone leaves `anon`/`authenticated`
-- with an implicit EXECUTE grant on this project. Name every role explicitly,
-- and grant to service_role only - this is a maintenance sweep invoked by the
-- scheduled Edge Function with the service-role key, never by a client.
revoke all on function public.expire_invitations() from public, anon, authenticated;
grant execute on function public.expire_invitations() to service_role;
