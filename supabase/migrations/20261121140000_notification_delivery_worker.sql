begin;

create or replace function public.claim_notification_deliveries(
  p_worker_id text,
  p_batch_size integer default 20,
  p_lease_seconds integer default 180
)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'NOTIFICATION_WORKER_SERVICE_ROLE_REQUIRED'
      using errcode = '42501';
  end if;

  if p_worker_id is null or length(p_worker_id) < 8 or length(p_worker_id) > 128 then
    raise exception 'INVALID_NOTIFICATION_WORKER_ID'
      using errcode = '22023';
  end if;

  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'INVALID_NOTIFICATION_BATCH_SIZE'
      using errcode = '22023';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'INVALID_NOTIFICATION_WORKER_LEASE'
      using errcode = '22023';
  end if;

  -- Close expired leases that have already consumed their retry budget.
  with exhausted as (
    update public.notification_deliveries d
       set status = 'dead_letter',
           locked_at = null,
           locked_by = null,
           last_error = coalesce(d.last_error, 'WORKER_LEASE_EXPIRED_MAX_ATTEMPTS'),
           updated_at = now()
     where d.status = 'processing'
       and d.locked_at < now() - make_interval(secs => p_lease_seconds)
       and d.attempts >= d.max_attempts
     returning d.id, d.tenant_id, d.school_id, d.attempts, d.last_error
  )
  insert into public.notification_delivery_dead_letters (
    delivery_id, tenant_id, school_id, attempts, final_error
  )
  select id, tenant_id, school_id, attempts, left(last_error, 1000)
    from exhausted
  on conflict (delivery_id) do nothing;

  -- Record an abandoned attempt before reclaiming its expired lease.
  insert into public.notification_delivery_attempts (
    delivery_id, attempt_number, provider_key, status, error_message, attempted_at
  )
  select d.id, d.attempts, d.provider_key, 'failed',
         'WORKER_LEASE_EXPIRED', coalesce(d.last_attempt_at, d.locked_at, now())
    from public.notification_deliveries d
   where d.status = 'processing'
     and d.locked_at < now() - make_interval(secs => p_lease_seconds)
     and d.attempts < d.max_attempts
  on conflict (delivery_id, attempt_number) do nothing;

  return query
  with candidates as (
    select d.id
      from public.notification_deliveries d
     where d.attempts < d.max_attempts
       and (
         (d.status in ('pending', 'failed') and d.next_attempt_at <= now())
         or
         (d.status = 'processing'
          and d.locked_at < now() - make_interval(secs => p_lease_seconds))
       )
     order by d.next_attempt_at asc, d.created_at asc
     for update skip locked
     limit p_batch_size
  )
  update public.notification_deliveries d
     set status = 'processing',
         attempts = d.attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         last_attempt_at = now(),
         updated_at = now()
    from candidates c
   where d.id = c.id
  returning d.*;
end;
$function$;

create or replace function public.complete_notification_delivery(
  p_delivery_id uuid,
  p_worker_id text,
  p_provider_message_id text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_delivery public.notification_deliveries%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'NOTIFICATION_WORKER_SERVICE_ROLE_REQUIRED'
      using errcode = '42501';
  end if;

  update public.notification_deliveries d
     set status = 'sent',
         provider_message_id = nullif(left(coalesce(p_provider_message_id, ''), 200), ''),
         sent_at = coalesce(d.sent_at, now()),
         locked_at = null,
         locked_by = null,
         last_error = null,
         updated_at = now()
   where d.id = p_delivery_id
     and d.status = 'processing'
     and d.locked_by = p_worker_id
  returning d.* into v_delivery;

  if not found then
    return 'lease_lost';
  end if;

  insert into public.notification_delivery_attempts (
    delivery_id, attempt_number, provider_key, status, provider_message_id, attempted_at
  )
  values (
    v_delivery.id, v_delivery.attempts, v_delivery.provider_key, 'sent',
    v_delivery.provider_message_id, coalesce(v_delivery.last_attempt_at, now())
  )
  on conflict (delivery_id, attempt_number) do nothing;

  return 'sent';
end;
$function$;

create or replace function public.fail_notification_delivery(
  p_delivery_id uuid,
  p_worker_id text,
  p_error_code text,
  p_http_status integer default null,
  p_permanent boolean default false
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_status text;
  v_backoff_seconds integer;
  v_error text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'NOTIFICATION_WORKER_SERVICE_ROLE_REQUIRED'
      using errcode = '42501';
  end if;

  if p_error_code is null or length(trim(p_error_code)) = 0 then
    p_error_code := 'PROVIDER_DELIVERY_FAILED';
  end if;
  if length(p_error_code) > 160 then
    p_error_code := left(p_error_code, 160);
  end if;
  if p_http_status is not null and (p_http_status < 100 or p_http_status > 599) then
    raise exception 'INVALID_NOTIFICATION_HTTP_STATUS'
      using errcode = '22023';
  end if;

  update public.notification_deliveries d
     set status = case
           when p_permanent or d.attempts >= d.max_attempts then 'dead_letter'
           else 'failed'
         end,
         next_attempt_at = case
           when p_permanent or d.attempts >= d.max_attempts then d.next_attempt_at
           else now() + make_interval(secs =>
             least(3600, (30 * power(2, least(6, greatest(0, d.attempts - 1))))::integer)
           )
         end,
         locked_at = null,
         locked_by = null,
         last_error = p_error_code,
         updated_at = now()
   where d.id = p_delivery_id
     and d.status = 'processing'
     and d.locked_by = p_worker_id
  returning d.* into v_delivery;

  if not found then
    return 'lease_lost';
  end if;

  insert into public.notification_delivery_attempts (
    delivery_id, attempt_number, provider_key, status, http_status,
    error_message, attempted_at
  )
  values (
    v_delivery.id, v_delivery.attempts, v_delivery.provider_key, 'failed',
    p_http_status, p_error_code, coalesce(v_delivery.last_attempt_at, now())
  )
  on conflict (delivery_id, attempt_number) do nothing;

  if v_delivery.status = 'dead_letter' then
    insert into public.notification_delivery_dead_letters (
      delivery_id, tenant_id, school_id, attempts, final_error
    )
    values (
      v_delivery.id, v_delivery.tenant_id, v_delivery.school_id,
      v_delivery.attempts, p_error_code
    )
    on conflict (delivery_id) do nothing;
  end if;

  return v_delivery.status;
end;
$function$;

revoke all on function public.claim_notification_deliveries(text, integer, integer)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.complete_notification_delivery(uuid, text, text)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.fail_notification_delivery(uuid, text, text, integer, boolean)
  from public, anon, authenticated, myschool_runtime;

grant execute on function public.claim_notification_deliveries(text, integer, integer)
  to service_role;
grant execute on function public.complete_notification_delivery(uuid, text, text)
  to service_role;
grant execute on function public.fail_notification_delivery(uuid, text, text, integer, boolean)
  to service_role;

comment on function public.claim_notification_deliveries(text, integer, integer) is
  'Atomically claims notification delivery rows with SKIP LOCKED and lease recovery. Service-role only.';
comment on function public.complete_notification_delivery(uuid, text, text) is
  'Completes a notification delivery only when the caller still owns the active worker lease. Service-role only.';
comment on function public.fail_notification_delivery(uuid, text, text, integer, boolean) is
  'Records provider attempt, applies bounded exponential backoff or dead-letter quarantine. Service-role only.';

commit;
