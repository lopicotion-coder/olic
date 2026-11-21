begin;

-- Provider routes never store API secrets. The API resolves credentials from server environment variables.
alter table public.ai_provider_routes
  add column if not exists input_price_per_million numeric(18,6) not null default 0,
  add column if not exists output_price_per_million numeric(18,6) not null default 0,
  add column if not exists max_output_tokens integer not null default 2048,
  add column if not exists timeout_ms integer not null default 30000,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ai_provider_routes
  add constraint ai_provider_routes_price_check
    check (input_price_per_million >= 0 and output_price_per_million >= 0),
  add constraint ai_provider_routes_output_limit_check
    check (max_output_tokens between 1 and 32000),
  add constraint ai_provider_routes_timeout_check
    check (timeout_ms between 1000 and 120000);

create index if not exists ai_provider_routes_lookup_idx
  on public.ai_provider_routes(tenant_id, school_id, feature_key, enabled, priority, created_at);

create table public.ai_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid,
  monthly_budget_amount numeric(18,4) not null check (monthly_budget_amount >= 0),
  currency char(3) not null default 'USD' check (currency = upper(currency)),
  monthly_request_limit integer not null default 2000 check (monthly_request_limit between 1 and 10000000),
  max_input_tokens integer not null default 12000 check (max_input_tokens between 1 and 200000),
  max_output_tokens integer not null default 2048 check (max_output_tokens between 1 and 32000),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create unique index ai_budgets_scope_unique
  on public.ai_budgets(tenant_id, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index ai_budgets_scope_lookup on public.ai_budgets(tenant_id, school_id, is_active);

create table public.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.ai_requests(id) on delete cascade,
  budget_id uuid not null references public.ai_budgets(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  reserved_amount numeric(18,6) not null check (reserved_amount >= 0),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create index ai_budget_reservations_scope_idx
  on public.ai_budget_reservations(budget_id, expires_at);

create table public.ai_budget_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.ai_requests(id) on delete cascade,
  budget_id uuid not null references public.ai_budgets(id) on delete restrict,
  tenant_id uuid not null,
  school_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  feature_key public.ai_feature_key not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  billed_amount numeric(18,6) not null default 0 check (billed_amount >= 0),
  currency char(3) not null default 'USD',
  outcome text not null check (outcome in ('completed','failed','blocked','refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create index ai_budget_events_usage_idx
  on public.ai_budget_events(tenant_id, school_id, created_at desc);

insert into public.permissions(key, description) values
  ('ai.budget.read', 'Read AI budget and metering'),
  ('ai.budget.manage', 'Manage AI budgets and provider routes')
on conflict (key) do nothing;

with mapping(role_key, permission_key) as (values
  ('platform_owner','ai.budget.read'),('platform_owner','ai.budget.manage'),
  ('platform_admin','ai.budget.read'),('platform_admin','ai.budget.manage'),
  ('tenant_owner','ai.budget.read'),('tenant_owner','ai.budget.manage'),
  ('school_owner','ai.budget.read'),('school_owner','ai.budget.manage'),
  ('school_admin','ai.budget.read'),('school_admin','ai.budget.manage'),
  ('finance','ai.budget.read')
)
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from mapping m
join public.roles r on r.key=m.role_key
join public.permissions p on p.key=m.permission_key
on conflict do nothing;

-- End-user requests need to see enabled routes; only administrators may manage them.
drop policy if exists ai_provider_routes_read on public.ai_provider_routes;
drop policy if exists ai_provider_routes_write on public.ai_provider_routes;
create policy ai_provider_routes_read on public.ai_provider_routes for select to myschool_runtime
  using (
    app.has_permission('ai.read',tenant_id,school_id,null)
    or app.has_permission('ai.manage',tenant_id,school_id,null)
    or (app.has_permission('ai.use',tenant_id,app.current_school_id(),null)
        and (school_id is null or school_id=app.current_school_id()))
  );
create policy ai_provider_routes_write on public.ai_provider_routes for all to myschool_runtime
  using (app.has_permission('ai.budget.manage',tenant_id,school_id,null)
      or app.has_permission('ai.manage',tenant_id,school_id,null))
  with check (app.has_permission('ai.budget.manage',tenant_id,school_id,null)
      or app.has_permission('ai.manage',tenant_id,school_id,null));

alter table public.ai_budgets enable row level security;
alter table public.ai_budget_reservations enable row level security;
alter table public.ai_budget_events enable row level security;

create policy ai_budgets_read on public.ai_budgets for select to myschool_runtime
  using (app.has_permission('ai.budget.read', tenant_id, school_id, null)
      or app.has_permission('ai.budget.manage', tenant_id, school_id, null)
      or (app.has_permission('ai.use', tenant_id, app.current_school_id(), null)
          and (school_id is null or school_id=app.current_school_id())));
create policy ai_budgets_write on public.ai_budgets for all to myschool_runtime
  using (app.has_permission('ai.budget.manage', tenant_id, school_id, null))
  with check (app.has_permission('ai.budget.manage', tenant_id, school_id, null));

create policy ai_budget_reservations_read on public.ai_budget_reservations for select to myschool_runtime
  using (user_id = auth.uid() or app.has_permission('ai.read', tenant_id, school_id, null)
      or app.has_permission('ai.budget.read', tenant_id, school_id, null));
create policy ai_budget_reservations_insert on public.ai_budget_reservations for insert to myschool_runtime
  with check (user_id = auth.uid() and app.has_permission('ai.use', tenant_id, school_id, null));
create policy ai_budget_reservations_delete on public.ai_budget_reservations for delete to myschool_runtime
  using (user_id = auth.uid() or app.has_permission('ai.manage', tenant_id, school_id, null));

create policy ai_budget_events_read on public.ai_budget_events for select to myschool_runtime
  using (user_id = auth.uid() or app.has_permission('ai.budget.read', tenant_id, school_id, null)
      or app.has_permission('ai.read', tenant_id, school_id, null));
create policy ai_budget_events_insert on public.ai_budget_events for insert to myschool_runtime
  with check (user_id = auth.uid() and app.has_permission('ai.use', tenant_id, school_id, null));

-- Do not expose new AI budget tables to the Supabase Data API.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to myschool_runtime;
grant usage, select on all sequences in schema public to myschool_runtime;
alter default privileges in schema public grant select, insert, update, delete on tables to myschool_runtime;
alter default privileges in schema public grant usage, select on sequences to myschool_runtime;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;