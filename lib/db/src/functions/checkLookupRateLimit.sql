-- check_lookup_rate_limit(device_key, ip) - T3.2/T3.3.
--
-- Records this call (the log, T3.3) and returns whether it is allowed under
-- ALL FOUR ceilings at once: per-account, per-device, per-IP, and a daily
-- per-account ceiling. Per-account alone is defeated by minting new accounts
-- (each new account has its own auth.uid()), which is exactly why the device
-- and IP dimensions exist independently - both are supplied by the caller (a
-- device key is self-reported, an IP cannot be, since the Edge Function
-- reads it from the request, not from client-supplied data) and neither
-- alone is sufficient, but combined they make enumeration expensive across
-- every axis an attacker controls.
--
-- Deliberately records the attempt UNCONDITIONALLY, even one that will be
-- refused - a refused call is exactly the signal T3.3's alarm needs to see.

create or replace function public.check_lookup_rate_limit(p_device_key text, p_ip text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  per_account_minute int;
  per_device_minute int;
  per_ip_minute int;
  per_account_day int;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.lookup_rate_limits (caller_id, device_key, ip)
  values (caller, p_device_key, p_ip);

  select count(*) into per_account_minute
    from public.lookup_rate_limits
   where caller_id = caller and looked_up_at > now() - interval '1 minute';

  select count(*) into per_device_minute
    from public.lookup_rate_limits
   where device_key = p_device_key and looked_up_at > now() - interval '1 minute';

  select count(*) into per_ip_minute
    from public.lookup_rate_limits
   where ip = p_ip and looked_up_at > now() - interval '1 minute';

  select count(*) into per_account_day
    from public.lookup_rate_limits
   where caller_id = caller and looked_up_at > now() - interval '1 day';

  return per_account_minute <= 20
     and per_device_minute <= 20
     and per_ip_minute <= 100
     and per_account_day <= 500;
end;
$$;

revoke all on function public.check_lookup_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.check_lookup_rate_limit(text, text) to authenticated;
