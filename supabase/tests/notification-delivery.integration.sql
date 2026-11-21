\set ON_ERROR_STOP on

do $anon_role$ begin create role anon nologin; exception when duplicate_object then null; end $anon_role$;
do $authenticated_role$ begin create role authenticated nologin; exception when duplicate_object then null; end $authenticated_role$;
do $runtime_role$ begin create role myschool_runtime nologin; exception when duplicate_object then null; end $runtime_role$;
do $service_role$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $service_role$;

create schema if not exists auth;
create or replace function auth.role()
returns text language sql stable
as $authrole$ select nullif(current_setting('request.jwt.claim.role', true), '') $authrole$;

create table public.notifications(id uuid primary key);
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  notification_id uuid not null references public.notifications(id),
  recipient_user_id uuid not null,
  channel text not null check(channel in ('email','push')),
  provider_key text not null check(provider_key in ('resend','expo')),
  status text not null check(status in ('pending','processing','sent','delivered','dead_letter','failed','cancelled')),
  attempts integer not null default 0 check(attempts>=0),
  max_attempts integer not null default 4,
  next_attempt_at timestamptz not null default now(),
  idempotency_key text not null,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  constraint processing_lease_check check((status='processing')=(locked_at is not null))
);
create table public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
  attempt_number integer not null check(attempt_number>0),
  provider_key text not null check(provider_key in ('resend','expo')),
  status text not null check(status in ('sent','failed')),
  http_status integer,
  provider_message_id text,
  error_message text,
  attempted_at timestamptz not null default now(),
  unique(delivery_id,attempt_number)
);
create table public.notification_delivery_dead_letters (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.notification_deliveries(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid not null,
  attempts integer not null,
  final_error text not null,
  quarantined_at timestamptz not null default now(),
  replayed_at timestamptz,
  replayed_by uuid
);

grant usage on schema auth to service_role, authenticated, myschool_runtime;
grant execute on function auth.role() to service_role, authenticated, myschool_runtime;

-- Apply the exact migration under test.
\ir ../migrations/20261121140000_notification_delivery_worker.sql

insert into public.notifications(id) values
('40000000-0000-0000-0000-000000000001'),
('40000000-0000-0000-0000-000000000002'),
('40000000-0000-0000-0000-000000000003');

insert into public.notification_deliveries(
 id,tenant_id,school_id,notification_id,recipient_user_id,channel,provider_key,status,
 attempts,max_attempts,next_attempt_at,idempotency_key,payload
) values
('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','email','resend','pending',0,3,now(),'email-1','{"to":"p@example.com","subject":"A","text":"B"}'),
('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','push','expo','pending',0,1,now(),'push-1','{"to":"ExpoPushToken[a]","title":"A","body":"B"}'),
('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','email','resend','pending',0,3,now(),'email-2','{"to":"p@example.com","subject":"B","text":"C"}');

do $unauthorized$ begin
  perform public.claim_notification_deliveries('untrusted-worker', 1, 180);
  raise exception 'unauthenticated claim was not rejected';
exception when insufficient_privilege then
  if sqlerrm <> 'NOTIFICATION_WORKER_SERVICE_ROLE_REQUIRED' then raise; end if;
end $unauthorized$;

set role service_role;
select set_config('request.jwt.claim.role','service_role',true);

do $claim_tests$ 
declare
  v_claimed setof public.notification_deliveries;
  v_first uuid;
  v_count integer;
  v_result text;
begin
  select count(*) into v_count from public.claim_notification_deliveries('worker-00000001', 2, 180);
  if v_count <> 2 then raise exception 'expected two claimed deliveries, got %',v_count; end if;

  select id into v_first from public.notification_deliveries where status='processing' and locked_by='worker-00000001' order by id limit 1;
  if v_first is null then raise exception 'first claim did not return a locked row'; end if;

  select count(*) into v_count from public.claim_notification_deliveries('worker-00000002', 2, 180);
  if v_count <> 1 then raise exception 'second worker should claim only the unclaimed row, got %',v_count; end if;

  v_result := public.complete_notification_delivery(v_first,'worker-00000001','provider-message-1');
  if v_result <> 'sent' then raise exception 'valid lease did not complete: %',v_result; end if;

  v_result := public.fail_notification_delivery(
    '50000000-0000-0000-0000-000000000002','worker-00000001','RESEND_HTTP_503',503,false
  );
  if v_result <> 'lease_lost' then raise exception 'worker without lease must not settle another worker row: %',v_result; end if;
end;
$claim_tests$;

reset role;
select set_config('request.jwt.claim.role','service_role',true);

-- The remaining leased deliveries are failed by their actual owners.
do $settle_tests$
declare
  r record;
  v_result text;
begin
  for r in select id,locked_by,provider_key from public.notification_deliveries where status='processing' loop
    v_result := public.fail_notification_delivery(r.id,r.locked_by,'PROVIDER_HTTP_503',503,false);
    if v_result <> 'failed' then raise exception 'transient failure should be retried: %',v_result; end if;
  end loop;
end;
$settle_tests$;

-- Immediate permanent errors go to dead-letter and are recorded once.
do $dead_letter_test$
declare
  r record;
  v_result text;
begin
  select id,locked_by into r from public.notification_deliveries where status='processing' limit 1;
  if r.id is null then raise exception 'no claimed delivery available for permanent failure'; end if;
  v_result := public.fail_notification_delivery(r.id,r.locked_by,'INVALID_PROVIDER_PAYLOAD',400,true);
  if v_result <> 'dead_letter' then raise exception 'permanent failure was not quarantined'; end if;
  if (select count(*) from public.notification_delivery_dead_letters where delivery_id=r.id) <> 1 then
    raise exception 'dead-letter record was not inserted exactly once';
  end if;
end;
$dead_letter_test$;

select 'notification delivery worker integration tests passed' as result;
reset role;
