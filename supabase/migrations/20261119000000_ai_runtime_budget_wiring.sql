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

  -- One shared monthly limit covers interactive AI and background work.
  select
    (select count(*) from public.ai_requests r
      where r.tenant_id = p_tenant_id
        and (budget_row.school_id is null or r.school_id is not distinct from budget_row.school_id)
        and r.created_at >= month_start)
    +
    (select count(*) from public.ai_background_budget_events e
      where e.budget_id = budget_row.id and e.created_at >= month_start)
    +
    (select count(*) from public.ai_background_budget_reservations r
      where r.budget_id = budget_row.id and r.expires_at > now())
    into request_count;

  if request_count > budget_row.monthly_request_limit then
    raise exception 'The monthly AI request limit has been exceeded';
  end if;

  select
    coalesce((select sum(e.billed_amount) from public.ai_budget_events e
      where e.budget_id = budget_row.id and e.created_at >= month_start), 0)
    +
    coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e
      where e.budget_id = budget_row.id and e.created_at >= month_start), 0)
    into spent_amount;

  select
    coalesce((select sum(r.reserved_amount) from public.ai_budget_reservations r
      where r.budget_id = budget_row.id and r.expires_at > now()), 0)
    +
    coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r
      where r.budget_id = budget_row.id and r.expires_at > now()), 0)
    into reserved_amount;

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

  select
    coalesce((select sum(e.billed_amount) from public.ai_budget_events e
      where e.budget_id = p_budget_id and e.created_at >= month_start), 0)
    +
    coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e
      where e.budget_id = p_budget_id and e.created_at >= month_start), 0)
    into spent_amount;

  select
    coalesce((select sum(r.reserved_amount) from public.ai_budget_reservations r
      where r.budget_id = p_budget_id and r.request_id <> p_request_id and r.expires_at > now()), 0)
    +
    coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r
      where r.budget_id = p_budget_id and r.expires_at > now()), 0)
    into other_reserved;

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

  select
    (select count(*) from public.learner_ai_requests r
      where r.created_at >= date_trunc('month', now()))
    +
    (select count(*) from public.ai_background_budget_events e
      where e.budget_id is null and e.created_at >= date_trunc('month', now()))
    +
    (select count(*) from public.ai_background_budget_reservations r
      where r.budget_id is null and r.expires_at > now())
    into request_count;
  if request_count > settings_row.monthly_request_limit then
    raise exception 'Platform monthly learner AI request limit has been reached';
  end if;

  delete from public.platform_ai_budget_reservations where expires_at <= now();

  select
    coalesce((select sum(e.billed_amount) from public.platform_ai_budget_events e
      where e.created_at >= date_trunc('month', now())), 0)
    +
    coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e
      where e.budget_id is null and e.created_at >= date_trunc('month', now())), 0)
    into spent_amount;

  select
    coalesce((select sum(r.reserved_amount) from public.platform_ai_budget_reservations r
      where r.expires_at > now()), 0)
    +
    coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r
      where r.budget_id is null and r.expires_at > now()), 0)
    into reserved_amount;

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

  select
    coalesce((select sum(e.billed_amount) from public.platform_ai_budget_events e
      where e.created_at >= date_trunc('month', now())), 0)
    +
    coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e
      where e.budget_id is null and e.created_at >= date_trunc('month', now())), 0)
    into spent_amount;

  select
    coalesce((select sum(r.reserved_amount) from public.platform_ai_budget_reservations r
      where r.request_id <> p_request_id and r.expires_at > now()), 0)
    +
    coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r
      where r.budget_id is null and r.expires_at > now()), 0)
    into other_reserved;

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


-- Background provider calls (question generation, embeddings, and RAG queries) do not
-- have ai_requests row IDs. Keep a separate operation ledger, but share the same
-- monthly tenant/platform spend, reservation, and request caps as interactive AI.
create table if not exists public.ai_background_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique check (length(trim(operation_key)) between 8 and 180),
  budget_id uuid references public.ai_budgets(id) on delete restrict,
  tenant_id uuid references public.tenants(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  requester_user_id uuid references auth.users(id) on delete set null,
  feature_key text not null,
  operation_kind text not null,
  provider_key text not null,
  model_key text not null,
  reserved_amount numeric(14,8) not null check (reserved_amount > 0),
  estimated_input_tokens integer not null check (estimated_input_tokens > 0),
  requested_output_tokens integer not null check (requested_output_tokens > 0),
  currency character(3) not null default 'USD' check (currency = 'USD'),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((tenant_id is null and school_id is null and budget_id is null)
      or (tenant_id is not null and budget_id is not null))
);

create table if not exists public.ai_background_budget_events (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  reservation_id uuid not null,
  budget_id uuid references public.ai_budgets(id) on delete restrict,
  tenant_id uuid references public.tenants(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  requester_user_id uuid references auth.users(id) on delete set null,
  feature_key text not null,
  operation_kind text not null,
  provider_key text not null,
  model_key text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  billed_amount numeric(14,8) not null check (billed_amount >= 0),
  currency character(3) not null default 'USD' check (currency = 'USD'),
  outcome text not null check (outcome in ('completed', 'failed', 'blocked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((tenant_id is null and school_id is null and budget_id is null)
      or (tenant_id is not null and budget_id is not null))
);

create index if not exists ai_background_budget_reservations_scope_idx
  on public.ai_background_budget_reservations(budget_id, expires_at);
create index if not exists ai_background_budget_events_scope_idx
  on public.ai_background_budget_events(budget_id, created_at);
create index if not exists ai_background_budget_events_platform_month_idx
  on public.ai_background_budget_events(created_at) where budget_id is null;

alter table public.ai_background_budget_reservations enable row level security;
alter table public.ai_background_budget_events enable row level security;
revoke all on public.ai_background_budget_reservations, public.ai_background_budget_events
  from public, anon, authenticated, myschool_runtime;
grant all on public.ai_background_budget_reservations, public.ai_background_budget_events
  to service_role;

create or replace function public.worker_reserve_background_ai_operation(
  p_operation_key text,
  p_tenant_id uuid,
  p_school_id uuid,
  p_requester_user_id uuid,
  p_feature_key text,
  p_operation_kind text,
  p_provider_key text,
  p_model_key text,
  p_estimated_amount numeric,
  p_estimated_input_tokens integer,
  p_requested_output_tokens integer,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  reservation_id uuid,
  max_input_tokens integer,
  max_output_tokens integer,
  currency character(3)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  budget_row public.ai_budgets%rowtype;
  platform_row public.platform_ai_runtime_settings%rowtype;
  reservation_row public.ai_background_budget_reservations%rowtype;
  request_count bigint;
  spent_amount numeric(14,8);
  reserved_amount numeric(14,8);
  month_start timestamptz := date_trunc('month', now());
begin
  if p_operation_key is null or length(trim(p_operation_key)) < 8 or length(p_operation_key) > 180
     or p_feature_key is null or length(trim(p_feature_key)) = 0
     or p_operation_kind is null or length(trim(p_operation_kind)) = 0
     or p_provider_key is null or length(trim(p_provider_key)) = 0
     or p_model_key is null or length(trim(p_model_key)) = 0 then
    raise exception 'Background operation identity and provider route are required';
  end if;
  if p_estimated_amount is null or p_estimated_amount <= 0
     or p_estimated_input_tokens is null or p_estimated_input_tokens < 1
     or p_requested_output_tokens is null or p_requested_output_tokens < 1 then
    raise exception 'A positive, priced background request and token estimate are required';
  end if;
  if p_school_id is not null and p_tenant_id is null then
    raise exception 'A school-scoped background operation must include tenant_id';
  end if;

  delete from public.ai_background_budget_reservations r where r.expires_at <= now();

  select * into reservation_row
    from public.ai_background_budget_reservations r
   where r.operation_key = p_operation_key
   for update;
  if found then
    if reservation_row.tenant_id is distinct from p_tenant_id
       or reservation_row.school_id is distinct from p_school_id
       or reservation_row.provider_key <> p_provider_key
       or reservation_row.model_key <> p_model_key then
      raise exception 'Background operation key is already reserved for a different scope or provider route';
    end if;
    return query select reservation_row.id,
      case when reservation_row.budget_id is null then
        (select s.max_input_tokens from public.platform_ai_runtime_settings s where s.singleton)
      else (select b.max_input_tokens from public.ai_budgets b where b.id = reservation_row.budget_id) end,
      case when reservation_row.budget_id is null then
        (select s.max_output_tokens from public.platform_ai_runtime_settings s where s.singleton)
      else (select b.max_output_tokens from public.ai_budgets b where b.id = reservation_row.budget_id) end,
      reservation_row.currency;
    return;
  end if;

  if exists (select 1 from public.ai_background_budget_events e where e.operation_key = p_operation_key) then
    raise exception 'Background operation has already been settled';
  end if;

  if p_tenant_id is not null then
    select * into budget_row
      from public.ai_budgets b
     where b.tenant_id = p_tenant_id
       and b.is_active
       and (b.school_id is not distinct from p_school_id
         or (p_school_id is not null and b.school_id is null))
     order by case when b.school_id is not distinct from p_school_id then 0 else 1 end
     limit 1
     for update;
    if not found then raise exception 'No active AI budget is configured for this background operation'; end if;
    if budget_row.currency <> 'USD' then raise exception 'AI background provider prices must be USD'; end if;
    if p_estimated_input_tokens > budget_row.max_input_tokens then
      raise exception 'Background operation exceeds the input token limit';
    end if;
    if p_requested_output_tokens > budget_row.max_output_tokens then
      raise exception 'Background operation exceeds the output token limit';
    end if;

    select
      (select count(*) from public.ai_requests r
        where r.tenant_id = p_tenant_id
          and (budget_row.school_id is null or r.school_id is not distinct from budget_row.school_id)
          and r.created_at >= month_start)
      +
      (select count(*) from public.ai_background_budget_events e
        where e.budget_id = budget_row.id and e.created_at >= month_start)
      into request_count;
    if request_count >= budget_row.monthly_request_limit then
      raise exception 'The monthly tenant AI request limit has been reached';
    end if;

    select
      coalesce((select sum(e.billed_amount) from public.ai_budget_events e
        where e.budget_id = budget_row.id and e.created_at >= month_start), 0)
      +
      coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e
        where e.budget_id = budget_row.id and e.created_at >= month_start), 0)
      into spent_amount;
    select
      coalesce((select sum(r.reserved_amount) from public.ai_budget_reservations r
        where r.budget_id = budget_row.id and r.expires_at > now()), 0)
      +
      coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r
        where r.budget_id = budget_row.id and r.expires_at > now()), 0)
      into reserved_amount;
    if p_estimated_amount > budget_row.monthly_budget_amount - spent_amount - reserved_amount then
      raise exception 'The remaining monthly tenant AI budget is insufficient';
    end if;

    insert into public.ai_background_budget_reservations(
      operation_key, budget_id, tenant_id, school_id, requester_user_id,
      feature_key, operation_kind, provider_key, model_key, reserved_amount,
      estimated_input_tokens, requested_output_tokens, currency, metadata
    ) values (
      p_operation_key, budget_row.id, p_tenant_id, p_school_id, p_requester_user_id,
      p_feature_key, p_operation_kind, p_provider_key, p_model_key, p_estimated_amount,
      p_estimated_input_tokens, p_requested_output_tokens, budget_row.currency, coalesce(p_metadata, '{}'::jsonb)
    ) returning * into reservation_row;
    return query select reservation_row.id, budget_row.max_input_tokens, budget_row.max_output_tokens, budget_row.currency;
    return;
  end if;

  -- Shared/public curriculum and independent learner RAG use the platform budget.
  select * into platform_row
    from public.platform_ai_runtime_settings s
   where s.singleton and s.is_enabled
   for update;
  if not found then
    raise exception 'Platform AI runtime is disabled; shared/global background AI operations are blocked';
  end if;
  if platform_row.currency <> 'USD' then raise exception 'Platform background AI budget must be USD'; end if;
  if p_estimated_input_tokens > platform_row.max_input_tokens then
    raise exception 'Background operation exceeds the input token limit';
  end if;
  if p_requested_output_tokens > platform_row.max_output_tokens then
    raise exception 'Background operation exceeds the output token limit';
  end if;

  select
    (select count(*) from public.learner_ai_requests r
      where r.created_at >= month_start)
    +
    (select count(*) from public.ai_background_budget_events e
      where e.budget_id is null and e.created_at >= month_start)
    +
    (select count(*) from public.ai_background_budget_reservations r
      where r.budget_id is null and r.expires_at > now())
    into request_count;
  if request_count >= platform_row.monthly_request_limit then
    raise exception 'The monthly platform AI request limit has been reached';
  end if;

  select
    coalesce((select sum(e.billed_amount) from public.platform_ai_budget_events e
      where e.created_at >= month_start), 0)
    +
    coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e
      where e.budget_id is null and e.created_at >= month_start), 0)
    into spent_amount;
  select
    coalesce((select sum(r.reserved_amount) from public.platform_ai_budget_reservations r
      where r.expires_at > now()), 0)
    +
    coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r
      where r.budget_id is null and r.expires_at > now()), 0)
    into reserved_amount;
  if p_estimated_amount > platform_row.monthly_budget_amount - spent_amount - reserved_amount then
    raise exception 'The remaining platform AI budget is insufficient';
  end if;

  insert into public.ai_background_budget_reservations(
    operation_key, tenant_id, school_id, requester_user_id,
    feature_key, operation_kind, provider_key, model_key, reserved_amount,
    estimated_input_tokens, requested_output_tokens, currency, metadata
  ) values (
    p_operation_key, null, null, p_requester_user_id,
    p_feature_key, p_operation_kind, p_provider_key, p_model_key, p_estimated_amount,
    p_estimated_input_tokens, p_requested_output_tokens, platform_row.currency, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into reservation_row;
  return query select reservation_row.id, platform_row.max_input_tokens, platform_row.max_output_tokens, platform_row.currency;
end;
$$;

create or replace function public.worker_finalize_background_ai_operation(
  p_operation_key text,
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
  reservation_row public.ai_background_budget_reservations%rowtype;
  budget_row public.ai_budgets%rowtype;
  platform_row public.platform_ai_runtime_settings%rowtype;
  spent_amount numeric(14,8);
  other_reserved numeric(14,8);
  month_start timestamptz := date_trunc('month', now());
begin
  if p_operation_key is null or p_provider_key is null or p_model_key is null
     or p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_billed_amount is null or p_billed_amount < 0 then
    raise exception 'Invalid background AI settlement values';
  end if;
  if exists (select 1 from public.ai_background_budget_events e where e.operation_key = p_operation_key) then
    return false;
  end if;

  select * into reservation_row
    from public.ai_background_budget_reservations r
   where r.operation_key = p_operation_key
   for update;
  if not found then raise exception 'Background AI reservation not found or expired'; end if;
  if reservation_row.provider_key <> p_provider_key or reservation_row.model_key <> p_model_key then
    raise exception 'Background AI provider route changed during the request';
  end if;

  if reservation_row.budget_id is not null then
    select * into budget_row from public.ai_budgets b where b.id = reservation_row.budget_id for update;
    if not found or not budget_row.is_active then raise exception 'Tenant AI budget is no longer active'; end if;
    if p_input_tokens > budget_row.max_input_tokens or p_output_tokens > budget_row.max_output_tokens then
      raise exception 'Actual background AI token usage exceeds tenant limits';
    end if;
    select
      coalesce((select sum(e.billed_amount) from public.ai_budget_events e
        where e.budget_id = budget_row.id and e.created_at >= month_start), 0)
      +
      coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e
        where e.budget_id = budget_row.id and e.created_at >= month_start), 0)
      into spent_amount;
    select
      coalesce((select sum(r.reserved_amount) from public.ai_budget_reservations r
        where r.budget_id = budget_row.id and r.expires_at > now()), 0)
      +
      coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r
        where r.budget_id = budget_row.id and r.operation_key <> p_operation_key and r.expires_at > now()), 0)
      into other_reserved;
    if p_billed_amount > budget_row.monthly_budget_amount - spent_amount - other_reserved then
      raise exception 'Actual background AI cost would exceed tenant budget';
    end if;
  else
    select * into platform_row from public.platform_ai_runtime_settings s
     where s.singleton and s.is_enabled for update;
    if not found then raise exception 'Platform AI runtime has been disabled during processing'; end if;
    if p_input_tokens > platform_row.max_input_tokens or p_output_tokens > platform_row.max_output_tokens then
      raise exception 'Actual background AI token usage exceeds platform limits';
    end if;
    select
      coalesce((select sum(e.billed_amount) from public.platform_ai_budget_events e
        where e.created_at >= month_start), 0)
      +
      coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e
        where e.budget_id is null and e.created_at >= month_start), 0)
      into spent_amount;
    select
      coalesce((select sum(r.reserved_amount) from public.platform_ai_budget_reservations r
        where r.expires_at > now()), 0)
      +
      coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r
        where r.budget_id is null and r.operation_key <> p_operation_key and r.expires_at > now()), 0)
      into other_reserved;
    if p_billed_amount > platform_row.monthly_budget_amount - spent_amount - other_reserved then
      raise exception 'Actual background AI cost would exceed platform budget';
    end if;
  end if;

  insert into public.ai_background_budget_events(
    operation_key, reservation_id, budget_id, tenant_id, school_id, requester_user_id,
    feature_key, operation_kind, provider_key, model_key, input_tokens, output_tokens,
    billed_amount, currency, outcome, metadata
  ) values (
    reservation_row.operation_key, reservation_row.id, reservation_row.budget_id,
    reservation_row.tenant_id, reservation_row.school_id, reservation_row.requester_user_id,
    reservation_row.feature_key, reservation_row.operation_kind, p_provider_key, p_model_key,
    p_input_tokens, p_output_tokens, p_billed_amount, reservation_row.currency,
    'completed', coalesce(p_metadata, '{}'::jsonb)
  );
  delete from public.ai_background_budget_reservations where operation_key = p_operation_key;
  return true;
end;
$$;

create or replace function public.worker_release_background_ai_operation(p_operation_key text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_count integer;
begin
  delete from public.ai_background_budget_reservations where operation_key = p_operation_key;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.worker_reserve_background_ai_operation(text, uuid, uuid, uuid, text, text, text, text, numeric, integer, integer, jsonb)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_finalize_background_ai_operation(text, text, text, integer, integer, numeric, jsonb)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_release_background_ai_operation(text)
  from public, anon, authenticated, myschool_runtime;
grant execute on function public.worker_reserve_background_ai_operation(text, uuid, uuid, uuid, text, text, text, text, numeric, integer, integer, jsonb)
  to service_role;
grant execute on function public.worker_finalize_background_ai_operation(text, text, text, integer, integer, numeric, jsonb)
  to service_role;
grant execute on function public.worker_release_background_ai_operation(text)
  to service_role;


-- If a provider call succeeded but persisting its response failed, settle the paid
-- usage as a failed application request and make it terminal (no duplicate retry).
create or replace function public.worker_fail_ai_request_after_provider(
  p_request_id uuid, p_budget_id uuid, p_provider_key text, p_model_key text,
  p_input_tokens integer, p_output_tokens integer, p_billed_amount numeric,
  p_failure_reason text, p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  request_row public.ai_requests%rowtype;
  reservation_row public.ai_budget_reservations%rowtype;
  budget_row public.ai_budgets%rowtype;
  spent_amount numeric(14,8);
  other_reserved numeric(14,8);
  month_start timestamptz := date_trunc('month', now());
begin
  if p_request_id is null or p_budget_id is null or p_provider_key is null or p_model_key is null
     or p_input_tokens is null or p_input_tokens < 0 or p_output_tokens is null or p_output_tokens < 0
     or p_billed_amount is null or p_billed_amount < 0 then
    raise exception 'Invalid failed AI request settlement values';
  end if;
  select * into request_row from public.ai_requests where id = p_request_id for update;
  if not found then raise exception 'AI request not found'; end if;
  if exists (select 1 from public.ai_budget_events e where e.request_id = p_request_id) then return false; end if;
  if request_row.status::text <> 'processing' then raise exception 'Only a processing AI request can be failed after provider success'; end if;
  select * into reservation_row from public.ai_budget_reservations r where r.request_id = p_request_id for update;
  if not found or reservation_row.budget_id <> p_budget_id then raise exception 'AI budget reservation missing or scope mismatch'; end if;
  select * into budget_row from public.ai_budgets b where b.id = p_budget_id for update;
  if not found then raise exception 'AI budget row no longer exists'; end if;

  select coalesce((select sum(e.billed_amount) from public.ai_budget_events e where e.budget_id = p_budget_id and e.created_at >= month_start), 0)
       + coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e where e.budget_id = p_budget_id and e.created_at >= month_start), 0)
    into spent_amount;
  select coalesce((select sum(r.reserved_amount) from public.ai_budget_reservations r where r.budget_id = p_budget_id and r.request_id <> p_request_id and r.expires_at > now()), 0)
       + coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r where r.budget_id = p_budget_id and r.expires_at > now()), 0)
    into other_reserved;
  -- The provider already incurred this spend. Record it even if actual usage exceeds
  -- the reservation or a newly-reduced cap; subsequent reservations will see the overrun.

  insert into public.ai_budget_events(
    request_id, budget_id, tenant_id, school_id, user_id, feature_key,
    input_tokens, output_tokens, billed_amount, currency, outcome, metadata
  ) values (
    p_request_id, p_budget_id, reservation_row.tenant_id, reservation_row.school_id,
    reservation_row.user_id, request_row.feature_key, p_input_tokens, p_output_tokens,
    p_billed_amount, budget_row.currency, 'failed',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'failure_reason', left(coalesce(p_failure_reason, 'post-provider persistence failure'), 1000),
      'budget_overrun', p_billed_amount > budget_row.monthly_budget_amount - spent_amount - other_reserved,
      'token_limit_exceeded', p_input_tokens > budget_row.max_input_tokens or p_output_tokens > budget_row.max_output_tokens
    )
  );

  update public.ai_requests
     set status = 'failed', provider_key = p_provider_key, model_key = p_model_key,
         tokens_in = p_input_tokens, tokens_out = p_output_tokens, cost_amount = p_billed_amount,
         completed_at = now(), locked_at = null, locked_by = null,
         safety_status = 'failed', last_error = left(coalesce(p_failure_reason, 'post-provider persistence failure'), 1000)
   where id = p_request_id;
  delete from public.ai_budget_reservations where request_id = p_request_id;
  return true;
end;
$$;

create or replace function public.worker_fail_learner_ai_request_after_provider(
  p_request_id uuid, p_provider_key text, p_model_key text,
  p_input_tokens integer, p_output_tokens integer, p_billed_amount numeric,
  p_failure_reason text, p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  request_row public.learner_ai_requests%rowtype;
  reservation_row public.platform_ai_budget_reservations%rowtype;
  settings_row public.platform_ai_runtime_settings%rowtype;
  spent_amount numeric(14,8);
  other_reserved numeric(14,8);
  month_start timestamptz := date_trunc('month', now());
begin
  if p_request_id is null or p_provider_key is null or p_model_key is null
     or p_input_tokens is null or p_input_tokens < 0 or p_output_tokens is null or p_output_tokens < 0
     or p_billed_amount is null or p_billed_amount < 0 then
    raise exception 'Invalid learner AI failure settlement values';
  end if;
  select * into request_row from public.learner_ai_requests where id = p_request_id for update;
  if not found then raise exception 'Learner AI request not found'; end if;
  if exists (select 1 from public.platform_ai_budget_events e where e.request_id = p_request_id) then return false; end if;
  if request_row.status <> 'processing' then raise exception 'Only a processing learner AI request can be failed after provider success'; end if;
  select * into reservation_row from public.platform_ai_budget_reservations r where r.request_id = p_request_id for update;
  if not found then raise exception 'Platform learner AI reservation not found'; end if;
  -- Read the current cap/pricing row even when runtime has just been disabled:
  -- already-incurred provider spend still has to be posted.
  select * into settings_row from public.platform_ai_runtime_settings s where s.singleton for update;
  if not found then raise exception 'Platform AI budget settings not found'; end if;
  -- Do not block settlement if the platform runtime was disabled or its route changed
  -- after the provider call: the external spend has already happened.

  select coalesce((select sum(e.billed_amount) from public.platform_ai_budget_events e where e.created_at >= month_start), 0)
       + coalesce((select sum(e.billed_amount) from public.ai_background_budget_events e where e.budget_id is null and e.created_at >= month_start), 0)
    into spent_amount;
  select coalesce((select sum(r.reserved_amount) from public.platform_ai_budget_reservations r where r.request_id <> p_request_id and r.expires_at > now()), 0)
       + coalesce((select sum(r.reserved_amount) from public.ai_background_budget_reservations r where r.budget_id is null and r.expires_at > now()), 0)
    into other_reserved;
  -- Record unavoidable external spend even if it exceeds a cap changed after reservation.

  insert into public.platform_ai_budget_events(
    request_id, learner_profile_id, requester_user_id, provider_key, model_key,
    input_tokens, output_tokens, billed_amount, currency, outcome, metadata
  ) values (
    p_request_id, request_row.learner_profile_id, request_row.requester_user_id,
    p_provider_key, p_model_key, p_input_tokens, p_output_tokens, p_billed_amount,
    settings_row.currency, 'failed',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'failure_reason', left(coalesce(p_failure_reason, 'post-provider persistence failure'), 1000),
      'budget_overrun', p_billed_amount > settings_row.monthly_budget_amount - spent_amount - other_reserved,
      'token_limit_exceeded', p_input_tokens > settings_row.max_input_tokens or p_output_tokens > settings_row.max_output_tokens
    )
  );
  update public.learner_ai_requests
     set status = 'failed', completed_at = now(), locked_at = null, locked_by = null,
         last_error = left(coalesce(p_failure_reason, 'post-provider persistence failure'), 1000), updated_at = now()
   where id = p_request_id;
  delete from public.platform_ai_budget_reservations where request_id = p_request_id;
  return true;
end;
$$;

revoke all on function public.worker_fail_ai_request_after_provider(uuid, uuid, text, text, integer, integer, numeric, text, jsonb)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_fail_learner_ai_request_after_provider(uuid, text, text, integer, integer, numeric, text, jsonb)
  from public, anon, authenticated, myschool_runtime;
grant execute on function public.worker_fail_ai_request_after_provider(uuid, uuid, text, text, integer, integer, numeric, text, jsonb)
  to service_role;
grant execute on function public.worker_fail_learner_ai_request_after_provider(uuid, text, text, integer, integer, numeric, text, jsonb)
  to service_role;

commit;
