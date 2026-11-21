begin;

-- Phase 5: advanced search, billing, backup/restore, sync outbox, and enterprise hardening.

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','quarterly','yearly')),
  base_price numeric(18,2) not null default 0,
  currency char(3) not null default 'EGP',
  features jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'trialing' check (status in ('trialing','active','past_due','suspended','archived')),
  starts_on date not null default current_date,
  ends_on date,
  trial_ends_on date,
  auto_renew boolean not null default true,
  seats integer not null default 0,
  monthly_price numeric(18,2) not null default 0,
  currency char(3) not null default 'EGP',
  external_reference text,
  paused_at timestamptz,
  archived_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index tenant_subscriptions_active_idx on public.tenant_subscriptions(tenant_id) where archived_at is null;

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.tenant_subscriptions(id) on delete cascade,
  invoice_number text not null,
  period_start date not null,
  period_end date not null,
  amount_due numeric(18,2) not null default 0,
  amount_paid numeric(18,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','issued','partially_paid','paid','overdue','void')),
  issued_on timestamptz,
  due_on date not null,
  paid_on timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index subscription_invoices_number_idx on public.subscription_invoices(tenant_id, invoice_number);
create index subscription_invoices_subscription_idx on public.subscription_invoices(subscription_id, created_at desc);

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.subscription_invoices(id) on delete cascade,
  receipt_number text not null,
  amount numeric(18,2) not null,
  payment_method text not null check (payment_method in ('cash','bank_transfer','card','cheque','other')),
  reference text,
  notes text,
  received_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index subscription_payments_receipt_idx on public.subscription_payments(tenant_id, receipt_number);

create table public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  backup_type text not null check (backup_type in ('snapshot','export','retention')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  destination text,
  manifest jsonb not null default '{}'::jsonb,
  requested_by uuid references public.profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index backup_jobs_lookup_idx on public.backup_jobs(tenant_id, school_id, created_at desc);

create table public.restore_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  backup_job_id uuid not null references public.backup_jobs(id) on delete cascade,
  restore_mode text not null check (restore_mode in ('full','partial','point_in_time')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  requested_by uuid references public.profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index restore_jobs_lookup_idx on public.restore_jobs(tenant_id, created_at desc);

create table public.search_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  body text not null default '',
  search_tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector not null default ''::tsvector,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- array_to_string(anyarray,text) is STABLE in PostgreSQL, so it cannot be used
-- in a stored generated expression. Maintain the search vector with a trigger.
create or replace function app.refresh_search_document_vector() returns trigger
language plpgsql security invoker
set search_path = pg_catalog, public, app
as $$
begin
  new.search_vector := to_tsvector(
    'simple'::regconfig,
    coalesce(new.title, '') || ' ' || coalesce(new.body, '') || ' ' ||
    coalesce(array_to_string(new.search_tags, ' '), '')
  );
  new.updated_at := now();
  return new;
end;
$$;
create trigger search_documents_vector_trigger
before insert or update of title, body, search_tags on public.search_documents
for each row execute function app.refresh_search_document_vector();

create unique index search_documents_unique_idx on public.search_documents(tenant_id, school_id, entity_type, entity_id);
create index search_documents_vector_idx on public.search_documents using gin (search_vector);

create table public.search_queries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  query_text text not null,
  result_count integer not null default 0,
  search_scope text not null default 'tenant' check (search_scope in ('tenant','school','global')),
  created_at timestamptz not null default now()
);
create index search_queries_lookup_idx on public.search_queries(tenant_id, school_id, created_at desc);

create table public.sync_outbox_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  device_id text,
  client_mutation_id text not null,
  entity_type text not null,
  entity_id uuid,
  operation text not null check (operation in ('create','update','delete','sync','publish')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','blocked','processing','synced','failed')),
  attempts integer not null default 0,
  last_error text,
  next_retry_at timestamptz,
  locked_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, school_id, client_mutation_id)
);
create index sync_outbox_status_idx on public.sync_outbox_entries(tenant_id, school_id, status, next_retry_at);

insert into public.permissions(key, description) values
  ('tenant.billing.read', 'Read tenant SaaS billing'),
  ('tenant.billing.manage', 'Manage tenant SaaS billing'),
  ('platform.operations.read', 'Read platform operations'),
  ('platform.operations.manage', 'Manage platform operations')
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('platform_owner','platform_admin') and p.key in ('tenant.billing.read','tenant.billing.manage','platform.operations.read','platform.operations.manage')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('platform_support') and p.key in ('platform.operations.read')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('tenant_owner','finance') and p.key in ('tenant.billing.read','tenant.billing.manage')
on conflict do nothing;

create or replace function app.sync_role_permission_change() returns trigger
language plpgsql security invoker
set search_path = pg_catalog, public, app
as $$
declare
  v_permission_key text;
begin
  if tg_op = 'DELETE' then
    select key into v_permission_key from public.permissions where id = old.permission_id;
    delete from app.user_effective_permissions uep
    using public.membership_roles mr
    where mr.role_id = old.role_id
      and uep.user_id = mr.user_id
      and uep.permission_key = v_permission_key
      and uep.tenant_id is not distinct from mr.tenant_id
      and uep.school_id is not distinct from mr.school_id
      and uep.class_id is not distinct from mr.class_id;
  else
    select key into v_permission_key from public.permissions where id = new.permission_id;
    insert into app.user_effective_permissions(user_id, tenant_id, school_id, class_id, permission_key)
    select mr.user_id, mr.tenant_id, mr.school_id, mr.class_id, v_permission_key
      from public.membership_roles mr
     where mr.role_id = new.role_id
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists role_permissions_sync_effective_permissions on public.role_permissions;
create trigger role_permissions_sync_effective_permissions
  after insert or delete on public.role_permissions
  for each row execute function app.sync_role_permission_change();

create or replace function app.can_access_backup_job(p_backup_job_id uuid, p_tenant_id uuid default null) returns boolean
language sql stable security invoker
set search_path = pg_catalog, public, app
as $$
  select exists (
    select 1 from public.backup_jobs bj
    where bj.id = p_backup_job_id
      and (p_tenant_id is null or bj.tenant_id = p_tenant_id)
      and app.has_permission('platform.operations.read', null, null, null)
  );
$$;

create or replace function app.can_access_restore_job(p_restore_job_id uuid, p_tenant_id uuid default null) returns boolean
language sql stable security invoker
set search_path = pg_catalog, public, app
as $$
  select exists (
    select 1 from public.restore_jobs rj
    where rj.id = p_restore_job_id
      and (p_tenant_id is null or rj.tenant_id = p_tenant_id)
      and app.has_permission('platform.operations.read', null, null, null)
  );
$$;

create or replace function app.can_access_search_query(p_query_id uuid) returns boolean
language sql stable security invoker
set search_path = pg_catalog, public, app
as $$
  select exists (
    select 1 from public.search_queries sq
    where sq.id = p_query_id
      and (sq.user_id = auth.uid() or app.has_permission('reports.read', sq.tenant_id, sq.school_id, null))
  );
$$;

alter table public.subscription_plans enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.backup_jobs enable row level security;
alter table public.restore_jobs enable row level security;
alter table public.search_documents enable row level security;
alter table public.search_queries enable row level security;
alter table public.sync_outbox_entries enable row level security;

create policy subscription_plans_read on public.subscription_plans for select to myschool_runtime
  using (app.has_permission('platform.billing.manage', null, null, null));
create policy subscription_plans_write on public.subscription_plans for all to myschool_runtime
  using (app.has_permission('platform.billing.manage', null, null, null))
  with check (app.has_permission('platform.billing.manage', null, null, null));

create policy tenant_subscriptions_read on public.tenant_subscriptions for select to myschool_runtime
  using (app.has_permission('tenant.billing.read', tenant_id, null, null) or app.has_permission('platform.billing.manage', null, null, null));
create policy tenant_subscriptions_write on public.tenant_subscriptions for all to myschool_runtime
  using (app.has_permission('tenant.billing.manage', tenant_id, null, null) or app.has_permission('platform.billing.manage', null, null, null))
  with check (app.has_permission('tenant.billing.manage', tenant_id, null, null) or app.has_permission('platform.billing.manage', null, null, null));

create policy subscription_invoices_read on public.subscription_invoices for select to myschool_runtime
  using (app.has_permission('tenant.billing.read', tenant_id, null, null) or app.has_permission('platform.billing.manage', null, null, null));
create policy subscription_invoices_write on public.subscription_invoices for all to myschool_runtime
  using (app.has_permission('tenant.billing.manage', tenant_id, null, null) or app.has_permission('platform.billing.manage', null, null, null))
  with check (app.has_permission('tenant.billing.manage', tenant_id, null, null) or app.has_permission('platform.billing.manage', null, null, null));

create policy subscription_payments_read on public.subscription_payments for select to myschool_runtime
  using (app.has_permission('tenant.billing.read', tenant_id, null, null) or app.has_permission('platform.billing.manage', null, null, null));
create policy subscription_payments_write on public.subscription_payments for insert to myschool_runtime
  with check (app.has_permission('tenant.billing.manage', tenant_id, null, null) or app.has_permission('platform.billing.manage', null, null, null));

create policy backup_jobs_read on public.backup_jobs for select to myschool_runtime
  using (app.has_permission('platform.operations.read', null, null, null));
create policy backup_jobs_write on public.backup_jobs for all to myschool_runtime
  using (app.has_permission('platform.operations.manage', null, null, null))
  with check (app.has_permission('platform.operations.manage', null, null, null));

create policy restore_jobs_read on public.restore_jobs for select to myschool_runtime
  using (app.has_permission('platform.operations.read', null, null, null));
create policy restore_jobs_write on public.restore_jobs for all to myschool_runtime
  using (app.has_permission('platform.operations.manage', null, null, null))
  with check (app.has_permission('platform.operations.manage', null, null, null));

create policy search_documents_read on public.search_documents for select to myschool_runtime
  using (app.can_access_tenant(tenant_id) or app.has_permission('reports.read', tenant_id, school_id, null));
create policy search_documents_write on public.search_documents for all to myschool_runtime
  using (app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('platform.operations.manage', null, null, null))
  with check (app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('platform.operations.manage', null, null, null));

create policy search_queries_read on public.search_queries for select to myschool_runtime
  using (user_id = auth.uid() or app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('platform.operations.read', null, null, null));
create policy search_queries_write on public.search_queries for insert to myschool_runtime
  with check (user_id = auth.uid() and (app.can_access_tenant(tenant_id) or app.has_permission('platform.operations.manage', null, null, null)));

create policy sync_outbox_read on public.sync_outbox_entries for select to myschool_runtime
  using (app.can_access_tenant(tenant_id) or app.has_permission('platform.operations.read', null, null, null));
create policy sync_outbox_write on public.sync_outbox_entries for all to myschool_runtime
  using (app.can_access_tenant(tenant_id) or app.has_permission('platform.operations.manage', null, null, null))
  with check (app.can_access_tenant(tenant_id) or app.has_permission('platform.operations.manage', null, null, null));


-- Explicit runtime grants and defaults for objects created by this migration.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to myschool_runtime;
grant usage, select on all sequences in schema public to myschool_runtime;
alter default privileges in schema public grant select, insert, update, delete on tables to myschool_runtime;
alter default privileges in schema public grant usage, select on sequences to myschool_runtime;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;