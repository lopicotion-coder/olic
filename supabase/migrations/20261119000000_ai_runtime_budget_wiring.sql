-- Complete AI runtime budget enforcement for tenant requests and independent learner tutor requests.
-- Secrets and real provider/budget prices are deliberately not included in migrations.

begin;

-- Tenant/school budgets are denominated in USD because provider route prices are USD per million tokens.
create or replace function public.worker_reserve_ai_budget(
  p_request_id uuid,
  p_tenant_id uuid,
  p_school_id uuid,
  p_user_id uuid,
  p_feature_key public.ai_feature_key,
  p_estimated_amount numeric,
  p_estimated_input_tokens integer,
  p_requested_output_tokens integer
)
returns table (
  reservation_id uuid,
  budget_id uuid,
  max_input_tokens integer,
  max_output_tokens integer,
  monthly_request_limit integer,
  currency character(3)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  budget_row public.ai_budgets%rowtype;
  reservation_row public.ai_budget_reservations%rowtype;
  month_start timestamptz := date_trunc('month', now());
  request_count bigint;
  spent_amount numeric(14,8);
  reserved_amount numeric(14,8);
  estimate numeric(14,8);
begin
  if p_request_id is null or p_tenant_id is null or p_user_id is null then
    raise exception 'Request, tenant and user are required';
  end if;
  if p_estimated_amount is null or p_estimated_amount <= 0 then
    raise exception 'A positive, priced AI request estimate is required';
  end if;
  if p_estimated_input_tokens is null or p_estimated_input_tokens < 1
     or p_requested_output_tokens is null or p_requested_output_tokens < 1 then
    raise exception 'Invalid token estimate';
  end if;

  delete from public.ai_budget_reservations r
  where r.expires_at <= now();

  select *
    into budget_row
    from public.ai_budgets b
   where b.tenant_id = p_tenant_id
     and b.is_active
     and (
       b.school_id is not distinct from p_school_id
       or (p_school_id is not null and b.school_id is null)
     )
   order by case when b.school_id is not distinct from p_school_id then 0 else 1 end
   limit 1
   for update;

  if not found then
    raise exception 'No active AI budget is configured for this tenant/school';
  end if;
  if budget_row.currency <> 'USD' then
    raise exception 'AI provider route prices are USD; configure this AI budget in USD';
  end if;
  if p_estimated_input_tokens > budget_row.max_input_tokens then
    raise exception 'AI request exceeds the budget input-token limit';
  end if;
  if p_requested_output_tokens > budget_row.max_output_tokens then
    raise exception 'AI request exceeds the budget output-token limit';
  end if;

  select *
    into reservation_row
    from public.ai_budget_reservations r
   where r.request_id = p_request_id
   for update;

  if found then
    if reservation_row.budget_id <> budget_row.id then
      raise exception 'AI request already has a reservation for a different budget';
    end if;
    return query select
      reservation_row.id, reservation_row.budget_id,
      budget_row.max_input_tokens, budget_row.max_output_tokens,
      budget_row.monthly_request_limit, budget_row.currency;
    return;
  end if;

  select count(*) into request_count
    from public.ai_requests r
   where r.tenant_id = p_tenant_id
     and r.school_id is not distinct from p_school_id
     and r.feature_key = p_feature_key
     and r.created_at >= month_start;

  if request_count > budget_row.monthly_request_limit then
    raise exception 'The monthly AI request limit has been exceeded';
  end if;

  select coalesce(sum(e.billed_amount), 0)
    into spent_amount
    from public.ai_budget_events e
   where e.budget_id = budget_row.id
     and e.created_at >= month_start;

  select coalesce(sum(r.reserved_amount), 0)
    into reserved_amount
    from public.ai_budget_reservations r
   where r.budget_id = budget_row.id
     and r.expires_at > now();

  estimate := p_estimated_amount;
  if estimate > budget_row.monthly_budget_amount - spent_amount - reserved_amount then
    raise exception 'The remaining monthly AI budget is insufficient for this request';
  end if;

  insert into public.ai_budget_reservations (
    request_id, budget_id, tenant_id, school_id, user_id,
    reserved_amount, expires_at
  )
  values (
    p_request_id, budget_row.id, p_tenant_id, p_school_id, p_user_id,
    estimate, now() + interval '15 minutes'
  )
  returning * into reservation_row;

  return query select
    reservation_row.id, reservation_row.budget_id,
    budget_row.max_input_tokens, budget_row.max_output_tokens,
    budget_row.monthly_request_limit, budget_row.currency;
end;
$$;

create or replace function public.worker_finalize_ai_request(
  p_request_id uuid,
  p_budget_id uuid,
  p_provider_key text,
  p_model_key text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_billed_amount numeric,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_row public.ai_requests%rowtype;
  reservation_row public.ai_budget_reservations%rowtype;
  budget_row public.ai_budgets%rowtype;
  month_start timestamptz := date_trunc('month', now());
  spent_amount numeric(14,8);
  other_reserved numeric(14,8);
begin
  if p_request_id is null or p_budget_id is null
     or p_provider_key is null or p_model_key is null then
    raise exception 'Request, budget, provider and model are required';
  end if;
  if p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_billed_amount is null or p_billed_amount < 0 then
    raise exception 'Invalid AI usage settlement values';
  end if;

  select * into request_row
    from public.ai_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'AI request not found'; end if;

  if exists (select 1 from public.ai_budget_events e where e.request_id = p_request_id) then
    return false;
  end if;
  if request_row.status::text <> 'processing' then
    raise exception 'Only a processing AI request can be finalized';
  end if;

  select * into reservation_row
    from public.ai_budget_reservations r
   where r.request_id = p_request_id
   for update;
  if not found then raise exception 'AI budget reservation not found'; end if;
  if reservation_row.budget_id <> p_budget_id then
    raise exception 'AI budget reservation scope mismatch';
  end if;

  select * into budget_row
    from public.ai_budgets b
   where b.id = p_budget_id
   for update;
  if not found or not budget_row.is_active then raise exception 'AI budget is no longer active'; end if;
  if p_input_tokens > budget_row.max_input_tokens or p_output_tokens > budget_row.max_output_tokens then
    raise exception 'Actual token usage exceeds the configured AI budget limits';
  end if;

  select coalesce(sum(e.billed_amount), 0)
    into spent_amount
    from public.ai_budget_events e
   where e.budget_id = p_budget_id
     and e.created_at >= month_start;

  select coalesce(sum(r.reserved_amount), 0)
    into other_reserved
    from public.ai_budget_reservations r
   where r.budget_id = p_budget_id
     and r.request_id <> p_request_id
     and r.expires_at > now();

  if p_billed_amount > budget_row.monthly_budget_amount - spent_amount - other_reserved then
    raise exception 'Actual AI cost would exceed the remaining monthly budget';
  end if;

  insert into public.ai_budget_events (
    request_id, budget_id, tenant_id, school_id, user_id, feature_key,
    input_tokens, output_tokens, billed_amount, currency, outcome, metadata
  )
  values (
    p_request_id, p_budget_id, reservation_row.tenant_id, reservation_row.school_id,
    reservation_row.user_id, request_row.feature_key, p_input_tokens, p_output_tokens,
    p_billed_amount, budget_row.currency, 'completed', coalesce(p_metadata, '{}'::jsonb)
  );

  update public.ai_requests
     set status = 'completed',
         provider_key = p_provider_key,
         model_key = p_model_key,
         tokens_in = p_input_tokens,
         tokens_out = p_output_tokens,
         cost_amount = p_billed_amount,
         completed_at = now(),
         locked_at = null,
         locked_by = null,
         last_error = null
   where id = p_request_id;

  delete from public.ai_budget_reservations where request_id = p_request_id;
  return true;
end;
$$;

-- A separate platform budget is required for learner-first usage because these requests
-- intentionally have no tenant_id and therefore must not consume a school's AI budget.
create table if not exists public.platform_ai_runtime_settings (
  singleton boolean primary key default true check (singleton),
  is_enabled boolean not null default false,
  provider_key text,
  model_key text,
  input_price_per_million numeric(14,8),
  output_price_per_million numeric(14,8),
  monthly_budget_amount numeric(14,8) not null default 0 check (monthly_budget_amount >= 0),
  currency character(3) not null default 'USD' check (currency = upper(currency)),
  monthly_request_limit integer not null default 0 check (monthly_request_limit >= 0),
  max_input_tokens integer not null default 0 check (max_input_tokens >= 0),
  max_output_tokens integer not null default 0 check (max_output_tokens >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (
    not is_enabled
    or (
      provider_key is not null and length(trim(provider_key)) > 0
      and model_key is not null and length(trim(model_key)) > 0
      and input_price_per_million is not null
      and input_price_per_million > 0
      and output_price_per_million is not null
      and output_price_per_million > 0
      and monthly_budget_amount > 0
      and monthly_request_limit > 0
      and max_input_tokens > 0
      and max_output_tokens > 0
      and currency = 'USD'
    )
  )
);

insert into public.platform_ai_runtime_settings(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.platform_ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.learner_ai_requests(id) on delete cascade,
  reserved_amount numeric(14,8) not null check (reserved_amount > 0),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now()
);

create table if not exists public.platform_ai_budget_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.learner_ai_requests(id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  provider_key text not null,
  model_key text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  billed_amount numeric(14,8) not null check (billed_amount >= 0),
  currency character(3) not null default 'USD' check (currency = 'USD'),
  outcome text not null check (outcome in ('completed', 'failed', 'blocked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_ai_budget_events_month_idx
  on public.platform_ai_budget_events(created_at, outcome);

create or replace function public.worker_get_platform_ai_runtime()
returns table (
  provider_key text,
  model_key text,
  input_price_per_million numeric,
  output_price_per_million numeric,
  monthly_budget_amount numeric,
  monthly_request_limit integer,
  max_input_tokens integer,
  max_output_tokens integer,
  currency character(3)
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    s.provider_key, s.model_key, s.input_price_per_million, s.output_price_per_million,
    s.monthly_budget_amount, s.monthly_request_limit, s.max_input_tokens,
    s.max_output_tokens, s.currency
  from public.platform_ai_runtime_settings s
  where s.singleton and s.is_enabled;
$$;

create or replace function public.worker_reserve_learner_ai_budget(
  p_request_id uuid,
  p_estimated_amount numeric,
  p_estimated_input_tokens integer,
  p_requested_output_tokens integer
)
returns table (
  reservation_id uuid,
  provider_key text,
  model_key text,
  input_price_per_million numeric,
  output_price_per_million numeric,
  max_input_tokens integer,
  max_output_tokens integer,
  monthly_request_limit integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  settings_row public.platform_ai_runtime_settings%rowtype;
  reservation_row public.platform_ai_budget_reservations%rowtype;
  request_row public.learner_ai_requests%rowtype;
  request_count bigint;
  spent_amount numeric(14,8);
  reserved_amount numeric(14,8);
begin
  select * into request_row
    from public.learner_ai_requests
   where id = p_request_id
   for update;
  if not found or request_row.status <> 'processing' then
    raise exception 'Learner AI request must be claimed before budget reservation';
  end if;

  select * into settings_row
    from public.platform_ai_runtime_settings
   where singleton and is_enabled
   for update;
  if not found then
    raise exception 'Platform AI runtime is disabled or has no configured provider/pricing/budget';
  end if;
  if settings_row.currency <> 'USD' then raise exception 'Platform AI runtime prices must be USD'; end if;

  if p_estimated_amount is null or p_estimated_amount <= 0
     or p_estimated_input_tokens is null or p_estimated_input_tokens < 1
     or p_requested_output_tokens is null or p_requested_output_tokens < 1 then
    raise exception 'Invalid learner AI cost/token estimate';
  end if;
  if p_estimated_input_tokens > settings_row.max_input_tokens
     or p_requested_output_tokens > settings_row.max_output_tokens then
    raise exception 'Learner AI request exceeds platform token limits';
  end if;

  select * into reservation_row
    from public.platform_ai_budget_reservations
   where request_id = p_request_id
   for update;
  if found then
    return query select
      reservation_row.id, settings_row.provider_key, settings_row.model_key,
      settings_row.input_price_per_million, settings_row.output_price_per_million,
      settings_row.max_input_tokens, settings_row.max_output_tokens,
      settings_row.monthly_request_limit;
    return;
  end if;

  select count(*) into request_count
    from public.learner_ai_requests r
   where r.created_at >= date_trunc('month', now());
  if request_count > settings_row.monthly_request_limit then
    raise exception 'Platform monthly learner AI request limit has been reached';
  end if;

  delete from public.platform_ai_budget_reservations where expires_at <= now();

  select coalesce(sum(e.billed_amount), 0) into spent_amount
    from public.platform_ai_budget_events e
   where e.created_at >= date_trunc('month', now());

  select coalesce(sum(r.reserved_amount), 0) into reserved_amount
    from public.platform_ai_budget_reservations r
   where r.expires_at > now();

  if p_estimated_amount > settings_row.monthly_budget_amount - spent_amount - reserved_amount then
    raise exception 'Platform monthly learner AI budget is insufficient';
  end if;

  insert into public.platform_ai_budget_reservations(request_id, reserved_amount, expires_at)
  values (p_request_id, p_estimated_amount, now() + interval '15 minutes')
  returning * into reservation_row;

  return query select
    reservation_row.id, settings_row.provider_key, settings_row.model_key,
    settings_row.input_price_per_million, settings_row.output_price_per_million,
    settings_row.max_input_tokens, settings_row.max_output_tokens,
    settings_row.monthly_request_limit;
end;
$$;

create or replace function public.worker_finalize_learner_ai_request(
  p_request_id uuid,
  p_provider_key text,
  p_model_key text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_billed_amount numeric,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_row public.learner_ai_requests%rowtype;
  reservation_row public.platform_ai_budget_reservations%rowtype;
  settings_row public.platform_ai_runtime_settings%rowtype;
  spent_amount numeric(14,8);
  other_reserved numeric(14,8);
begin
  select * into request_row
    from public.learner_ai_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'Learner AI request not found'; end if;

  if exists (select 1 from public.platform_ai_budget_events e where e.request_id = p_request_id) then
    return false;
  end if;
  if request_row.status <> 'processing' then raise exception 'Learner AI request is not processing'; end if;

  select * into reservation_row
    from public.platform_ai_budget_reservations r
   where r.request_id = p_request_id
   for update;
  if not found then raise exception 'Platform learner AI budget reservation not found'; end if;

  select * into settings_row
    from public.platform_ai_runtime_settings
   where singleton and is_enabled
   for update;
  if not found then raise exception 'Platform AI runtime has been disabled during request processing'; end if;

  if p_provider_key is null or p_model_key is null
     or p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_billed_amount is null or p_billed_amount < 0
     or p_provider_key <> settings_row.provider_key
     or p_model_key <> settings_row.model_key then
    raise exception 'Invalid platform learner AI settlement';
  end if;
  if p_input_tokens > settings_row.max_input_tokens or p_output_tokens > settings_row.max_output_tokens then
    raise exception 'Actual learner AI token usage exceeds configured limits';
  end if;

  select coalesce(sum(e.billed_amount), 0) into spent_amount
    from public.platform_ai_budget_events e
   where e.created_at >= date_trunc('month', now());

  select coalesce(sum(r.reserved_amount), 0) into other_reserved
    from public.platform_ai_budget_reservations r
   where r.request_id <> p_request_id and r.expires_at > now();

  if p_billed_amount > settings_row.monthly_budget_amount - spent_amount - other_reserved then
    raise exception 'Actual learner AI cost would exceed the platform monthly budget';
  end if;

  insert into public.platform_ai_budget_events(
    request_id, learner_profile_id, requester_user_id, provider_key, model_key,
    input_tokens, output_tokens, billed_amount, currency, outcome, metadata
  )
  values(
    p_request_id, request_row.learner_profile_id, request_row.requester_user_id,
    p_provider_key, p_model_key, p_input_tokens, p_output_tokens,
    p_billed_amount, settings_row.currency, 'completed', coalesce(p_metadata, '{}'::jsonb)
  );

  update public.learner_ai_requests
     set status = 'completed',
         completed_at = now(),
         locked_at = null,
         locked_by = null,
         last_error = null,
         updated_at = now()
   where id = p_request_id;

  delete from public.platform_ai_budget_reservations where request_id = p_request_id;
  return true;
end;
$$;

create or replace function public.worker_release_learner_ai_budget_reservation(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_count integer;
begin
  delete from public.platform_ai_budget_reservations where request_id = p_request_id;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on public.platform_ai_runtime_settings, public.platform_ai_budget_reservations, public.platform_ai_budget_events
  from public, anon, authenticated, myschool_runtime;
grant all on public.platform_ai_runtime_settings, public.platform_ai_budget_reservations, public.platform_ai_budget_events
  to service_role;

revoke all on function public.worker_reserve_ai_budget(uuid, uuid, uuid, uuid, public.ai_feature_key, numeric, integer, integer)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_finalize_ai_request(uuid, uuid, text, text, integer, integer, numeric, jsonb)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_release_ai_budget_reservation(uuid)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_get_platform_ai_runtime()
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_reserve_learner_ai_budget(uuid, numeric, integer, integer)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_finalize_learner_ai_request(uuid, text, text, integer, integer, numeric, jsonb)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_release_learner_ai_budget_reservation(uuid)
  from public, anon, authenticated, myschool_runtime;

grant execute on function public.worker_reserve_ai_budget(uuid, uuid, uuid, uuid, public.ai_feature_key, numeric, integer, integer) to service_role;
grant execute on function public.worker_finalize_ai_request(uuid, uuid, text, text, integer, integer, numeric, jsonb) to service_role;
grant execute on function public.worker_release_ai_budget_reservation(uuid) to service_role;
grant execute on function public.worker_get_platform_ai_runtime() to service_role;
grant execute on function public.worker_reserve_learner_ai_budget(uuid, numeric, integer, integer) to service_role;
grant execute on function public.worker_finalize_learner_ai_request(uuid, text, text, integer, integer, numeric, jsonb) to service_role;
grant execute on function public.worker_release_learner_ai_budget_reservation(uuid) to service_role;

commit;
