-- My School / Phase 1 Foundation
-- Requires Supabase Auth (auth.users/auth.uid) and PostgreSQL 15+.
-- App tables are deliberately not exposed to Supabase Data API roles.

begin;

create extension if not exists pgcrypto;
create schema if not exists app;

-- Non-login role used only by the NestJS API after it sets verified JWT context.
-- A separate login role is created in database/bootstrap/001_runtime_login_role.sql.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'myschool_runtime') then
    create role myschool_runtime nologin noinherit nobypassrls;
  end if;
end $$;

grant usage on schema public, app, auth to myschool_runtime;
grant execute on function auth.uid() to myschool_runtime;
grant execute on function auth.jwt() to myschool_runtime;

create type public.record_status as enum ('active', 'inactive', 'archived');
create type public.tenant_status as enum ('demo', 'validation', 'active', 'read_only', 'suspended', 'archived');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'revoked');
create type public.role_scope as enum ('platform', 'tenant', 'school', 'class');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text,
  display_name text,
  avatar_path text,
  preferred_locale text not null default 'en',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_normalized check (email is null or email = lower(trim(email)))
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  slug text not null unique,
  status public.tenant_status not null default 'demo',
  default_locale text not null default 'en',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint tenants_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status public.membership_status not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (id, tenant_id, user_id)
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null,
  code text,
  slug text not null,
  status public.record_status not null default 'active',
  logo_path text,
  primary_color text,
  default_locale text not null default 'en',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (id, tenant_id),
  unique (id, tenant_id, name),
  constraint schools_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')
);

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  name text not null,
  code text,
  status public.record_status not null default 'active',
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (school_id, code)
);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  status public.membership_status not null default 'invited',
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  unique (school_id, user_id),
  unique (id, tenant_id, school_id, user_id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  scope public.role_scope not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  tenant_id uuid references public.tenants(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  class_id uuid,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint membership_roles_scope_shape check (
    (tenant_id is null and school_id is null and class_id is null) or
    (tenant_id is not null and school_id is null and class_id is null) or
    (tenant_id is not null and school_id is not null and class_id is null) or
    (tenant_id is not null and school_id is not null and class_id is not null)
  ),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict
);
create index membership_roles_user_scope_idx on public.membership_roles(user_id, tenant_id, school_id);

-- A read-only permission projection makes RLS checks non-recursive and fast.
create table app.user_effective_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid,
  school_id uuid,
  class_id uuid,
  permission_key text not null,
  created_at timestamptz not null default now()
);

-- Active membership scope is denormalized for non-recursive, immediate access revocation.
-- It is not user-editable and is maintained only by triggers on membership rows.
create table app.user_membership_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  status public.membership_status not null,
  updated_at timestamptz not null default now()
);
create unique index user_membership_scopes_unique_idx
  on app.user_membership_scopes(user_id, tenant_id, school_id) nulls not distinct;
create index user_membership_scopes_active_idx
  on app.user_membership_scopes(user_id, tenant_id, school_id, status);
insert into app.user_membership_scopes(user_id,tenant_id,school_id,status)
select user_id,tenant_id,null,status from public.tenant_memberships
union all
select user_id,tenant_id,school_id,status from public.school_memberships
on conflict (user_id,tenant_id,school_id) do update set status=excluded.status,updated_at=now();
create unique index effective_permissions_unique_scope_idx on app.user_effective_permissions(
  user_id, coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(school_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(class_id,'00000000-0000-0000-0000-000000000000'::uuid), permission_key
);
create unique index membership_roles_unique_scope_idx on public.membership_roles(
  user_id, role_id, coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(school_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(class_id,'00000000-0000-0000-0000-000000000000'::uuid)
);
create index effective_permissions_lookup_idx
  on app.user_effective_permissions(user_id, permission_key, tenant_id, school_id, class_id);

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  ip_hash text,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_created_idx on public.audit_logs(tenant_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

-- Request context comes only from the API after validating the Supabase JWT.
create or replace function app.current_user_id() returns uuid
language sql stable as $$ select auth.uid() $$;

create or replace function app.current_tenant_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.current_tenant_id', true), '')::uuid $$;

create or replace function app.current_school_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.current_school_id', true), '')::uuid $$;

create or replace function app.has_permission(
  p_permission text,
  p_tenant_id uuid default null,
  p_school_id uuid default null,
  p_class_id uuid default null
) returns boolean
language sql stable security invoker
set search_path = pg_catalog, app
as $$
  select exists (
    select 1
    from app.user_effective_permissions e
    where e.user_id = auth.uid()
      and e.permission_key = p_permission
      and (e.tenant_id is null or (
        e.tenant_id = p_tenant_id and exists (
          select 1 from app.user_membership_scopes ts
          where ts.user_id=auth.uid() and ts.tenant_id=e.tenant_id
            and ts.school_id is null and ts.status='active'
        )
      ))
      and (e.school_id is null or (
        e.school_id = p_school_id and exists (
          select 1 from app.user_membership_scopes ss
          where ss.user_id=auth.uid() and ss.tenant_id=e.tenant_id
            and ss.school_id=e.school_id and ss.status='active'
        )
      ))
      and (e.class_id is null or e.class_id = p_class_id)
  );
$$;

create or replace function app.can_access_tenant(p_tenant_id uuid) returns boolean
language sql stable security invoker
set search_path = pg_catalog, public, app
as $$
  select exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  ) or app.has_permission('platform.tenants.read', null, null, null);
$$;

create or replace function app.can_access_school(p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker
set search_path = pg_catalog, public, app
as $$
  select (
    exists (
      select 1 from public.school_memberships sm
      where sm.tenant_id = p_tenant_id
        and sm.school_id = p_school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
    ) and app.can_access_tenant(p_tenant_id)
  ) or app.has_permission('platform.schools.read', null, null, null)
    or app.has_permission('schools.read', p_tenant_id, p_school_id, null);
$$;

-- Refresh derived permissions after a role assignment is inserted or deleted.
create or replace function app.sync_effective_permissions() returns trigger
language plpgsql security invoker
set search_path = pg_catalog, public, app
as $$
declare
  v_user_id uuid;
  v_tenant_id uuid;
  v_school_id uuid;
  v_class_id uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id; v_tenant_id := old.tenant_id; v_school_id := old.school_id; v_class_id := old.class_id;
  else
    v_user_id := new.user_id; v_tenant_id := new.tenant_id; v_school_id := new.school_id; v_class_id := new.class_id;
  end if;

  delete from app.user_effective_permissions
   where user_id = v_user_id
     and tenant_id is not distinct from v_tenant_id
     and school_id is not distinct from v_school_id
     and class_id is not distinct from v_class_id;

  if tg_op <> 'DELETE' then
    insert into app.user_effective_permissions(user_id, tenant_id, school_id, class_id, permission_key)
    select new.user_id, new.tenant_id, new.school_id, new.class_id, p.key
      from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
     where rp.role_id = new.role_id
    on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger membership_roles_sync_permissions
  after insert or delete on public.membership_roles
  for each row execute function app.sync_effective_permissions();

create or replace function app.validate_membership_role_scope() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_scope public.role_scope;
begin
  select scope into v_scope from public.roles where id=new.role_id;
  if v_scope='platform' and (new.tenant_id is not null or new.school_id is not null or new.class_id is not null) then
    raise exception 'Platform roles must have platform scope only';
  elsif v_scope='tenant' and (new.tenant_id is null or new.school_id is not null or new.class_id is not null) then
    raise exception 'Tenant roles require tenant scope only';
  elsif v_scope='school' and (new.tenant_id is null or new.school_id is null or new.class_id is not null) then
    raise exception 'School roles require tenant and school scope';
  elsif v_scope='class' and (new.tenant_id is null or new.school_id is null or new.class_id is null) then
    raise exception 'Class roles require tenant, school and class scope';
  end if;
  return new;
end; $$;
create trigger membership_roles_validate_scope
  before insert on public.membership_roles for each row execute function app.validate_membership_role_scope();

-- Authorization catalog is readable, but only migrations/platform provisioning can modify it.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
create policy roles_read_runtime on public.roles for select to myschool_runtime using (true);
create policy permissions_read_runtime on public.permissions for select to myschool_runtime using (true);
create policy role_permissions_read_runtime on public.role_permissions for select to myschool_runtime using (true);
alter table app.user_effective_permissions enable row level security;
create policy effective_permissions_self_read on app.user_effective_permissions
  for select to myschool_runtime using (user_id = auth.uid());
create policy effective_permissions_authenticated_self on app.user_effective_permissions
  for select to authenticated using (user_id = auth.uid());
create policy effective_permissions_admin_insert on app.user_effective_permissions
  for insert to myschool_runtime with check (
    app.has_permission('users.manage', tenant_id, school_id, class_id)
    or app.has_permission('platform.roles.manage', null, null, null)
  );
create policy effective_permissions_admin_delete on app.user_effective_permissions
  for delete to myschool_runtime using (
    app.has_permission('users.manage', tenant_id, school_id, class_id)
    or app.has_permission('platform.roles.manage', null, null, null)
  );

-- Profiles are self-readable/writable; privileged access is always mediated by specific domain records.
alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select to myschool_runtime using (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert to myschool_runtime with check (id = auth.uid());
create policy profiles_admin_insert on public.profiles for insert to myschool_runtime
  with check (
    exists (select 1 from public.tenant_memberships tm
      where tm.user_id=profiles.id and tm.tenant_id=app.current_tenant_id() and tm.status in ('active','invited'))
    and (
      app.has_permission('users.manage', app.current_tenant_id(), null, null)
      or (app.current_school_id() is not null
        and exists (select 1 from public.school_memberships sm
          where sm.user_id=profiles.id and sm.tenant_id=app.current_tenant_id()
            and sm.school_id=app.current_school_id() and sm.status in ('active','invited'))
        and app.has_permission('users.manage', app.current_tenant_id(), app.current_school_id(), null))
      or app.has_permission('platform.tenants.manage', null, null, null)
    )
  );
create policy profiles_self_update on public.profiles for update to myschool_runtime
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_directory_read on public.profiles for select to myschool_runtime
  using (
    exists (select 1 from public.tenant_memberships tm
      where tm.user_id=profiles.id and app.has_permission('users.read', tm.tenant_id, null, null))
    or exists (select 1 from public.school_memberships sm
      where sm.user_id=profiles.id and sm.status in ('active','invited')
        and app.has_permission('users.read', sm.tenant_id, sm.school_id, null))
  );

alter table public.tenants enable row level security;
create policy tenants_read_scope on public.tenants for select to myschool_runtime
  using (app.can_access_tenant(id));
create policy tenants_insert_platform on public.tenants for insert to myschool_runtime
  with check (app.has_permission('platform.tenants.manage', null, null, null));
create policy tenants_update_platform on public.tenants for update to myschool_runtime
  using (app.has_permission('platform.tenants.manage', null, null, null))
  with check (app.has_permission('platform.tenants.manage', null, null, null));

alter table public.tenant_memberships enable row level security;
create policy tenant_memberships_read_self_or_admin on public.tenant_memberships for select to myschool_runtime
  using (user_id = auth.uid()
    or app.has_permission('users.read', tenant_id, null, null)
    or (app.current_school_id() is not null
      and app.has_permission('users.read', tenant_id, app.current_school_id(), null)
      and exists (select 1 from public.school_memberships sm
        where sm.tenant_id=tenant_memberships.tenant_id and sm.user_id=tenant_memberships.user_id
          and sm.school_id=app.current_school_id() and sm.status in ('active','invited'))));
create policy tenant_memberships_insert_admin on public.tenant_memberships for insert to myschool_runtime
  with check (app.has_permission('users.manage', tenant_id, null, null)
    or (app.current_school_id() is not null and app.has_permission('users.manage', tenant_id, app.current_school_id(), null))
    or app.has_permission('platform.tenants.manage', null, null, null));
create policy tenant_memberships_update_admin on public.tenant_memberships for update to myschool_runtime
  using (app.has_permission('tenant.memberships.manage', tenant_id, null, null)
    or app.has_permission('platform.tenants.manage', null, null, null))
  with check (app.has_permission('tenant.memberships.manage', tenant_id, null, null)
    or app.has_permission('platform.tenants.manage', null, null, null));
create policy tenant_memberships_self_accept on public.tenant_memberships for update to myschool_runtime
  using (user_id=auth.uid() and status='invited') with check (user_id=auth.uid() and status='active');

alter table public.schools enable row level security;
create policy schools_read_scope on public.schools for select to myschool_runtime
  using (app.can_access_school(tenant_id, id) or app.has_permission('schools.read', tenant_id, id, null));
create policy schools_insert_scope on public.schools for insert to myschool_runtime
  with check (app.has_permission('schools.manage', tenant_id, null, null) or app.has_permission('platform.schools.manage', null, null, null));
create policy schools_update_scope on public.schools for update to myschool_runtime
  using (app.has_permission('schools.manage', tenant_id, id, null) or app.has_permission('platform.schools.manage', null, null, null))
  with check (app.has_permission('schools.manage', tenant_id, id, null) or app.has_permission('platform.schools.manage', null, null, null));

alter table public.campuses enable row level security;
create policy campuses_read_scope on public.campuses for select to myschool_runtime
  using (app.can_access_school(tenant_id, school_id) or app.has_permission('schools.read', tenant_id, school_id, null));
create policy campuses_insert_scope on public.campuses for insert to myschool_runtime
  with check (app.has_permission('schools.manage', tenant_id, school_id, null) or app.has_permission('platform.schools.manage', null, null, null));
create policy campuses_update_scope on public.campuses for update to myschool_runtime
  using (app.has_permission('schools.manage', tenant_id, school_id, null) or app.has_permission('platform.schools.manage', null, null, null))
  with check (app.has_permission('schools.manage', tenant_id, school_id, null) or app.has_permission('platform.schools.manage', null, null, null));

alter table public.school_memberships enable row level security;
create policy school_memberships_read_scope on public.school_memberships for select to myschool_runtime
  using (user_id = auth.uid() or app.has_permission('users.read', tenant_id, school_id, null));
create policy school_memberships_insert_scope on public.school_memberships for insert to myschool_runtime
  with check (app.has_permission('users.manage', tenant_id, school_id, null) or app.has_permission('platform.schools.manage', null, null, null));
create policy school_memberships_update_scope on public.school_memberships for update to myschool_runtime
  using (app.has_permission('users.manage', tenant_id, school_id, null) or app.has_permission('platform.schools.manage', null, null, null))
  with check (app.has_permission('users.manage', tenant_id, school_id, null) or app.has_permission('platform.schools.manage', null, null, null));
create policy school_memberships_self_accept on public.school_memberships for update to myschool_runtime
  using (user_id=auth.uid() and status='invited') with check (user_id=auth.uid() and status='active');

alter table app.user_membership_scopes enable row level security;
create policy membership_scopes_self_read on app.user_membership_scopes for select to myschool_runtime
  using (user_id=auth.uid());
create policy membership_scopes_authenticated_self_read on app.user_membership_scopes for select to authenticated
  using (user_id=auth.uid());
create policy membership_scopes_admin_insert on app.user_membership_scopes for insert to myschool_runtime
  with check (app.has_permission('users.manage',tenant_id,null,null)
    or (app.current_school_id() is not null and app.has_permission('users.manage',tenant_id,app.current_school_id(),null))
    or app.has_permission('platform.tenants.manage',null,null,null));
create policy membership_scopes_admin_update on app.user_membership_scopes for update to myschool_runtime
  using (app.has_permission('users.manage',tenant_id,school_id,null)
    or app.has_permission('platform.tenants.manage',null,null,null))
  with check (app.has_permission('users.manage',tenant_id,school_id,null)
    or app.has_permission('platform.tenants.manage',null,null,null));
create policy membership_scopes_self_accept on app.user_membership_scopes for update to myschool_runtime
  using (user_id=auth.uid() and status='invited')
  with check (user_id=auth.uid() and status='active');
create policy membership_scopes_admin_delete on app.user_membership_scopes for delete to myschool_runtime
  using (app.has_permission('users.manage',tenant_id,school_id,null)
    or app.has_permission('platform.tenants.manage',null,null,null));

-- Synchronize the private membership projection for API and Storage RLS.
create or replace function app.sync_tenant_membership_scope() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public,app as $$
begin
  if tg_op='DELETE' then
    delete from app.user_membership_scopes where user_id=old.user_id and tenant_id=old.tenant_id and school_id is null;
    return old;
  elsif tg_op='INSERT' then
    insert into app.user_membership_scopes(user_id,tenant_id,school_id,status)
    values (new.user_id,new.tenant_id,null,new.status);
  else
    update app.user_membership_scopes set status=new.status,updated_at=now()
    where user_id=new.user_id and tenant_id=new.tenant_id and school_id is null;
  end if;
  return new;
end; $$;
create trigger tenant_membership_scope_sync
  after insert or update of status or delete on public.tenant_memberships
  for each row execute function app.sync_tenant_membership_scope();

create or replace function app.sync_school_membership_scope() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public,app as $$
begin
  if tg_op='DELETE' then
    delete from app.user_membership_scopes where user_id=old.user_id and tenant_id=old.tenant_id and school_id=old.school_id;
    return old;
  elsif tg_op='INSERT' then
    insert into app.user_membership_scopes(user_id,tenant_id,school_id,status)
    values (new.user_id,new.tenant_id,new.school_id,new.status);
  else
    update app.user_membership_scopes set status=new.status,updated_at=now()
    where user_id=new.user_id and tenant_id=new.tenant_id and school_id=new.school_id;
  end if;
  return new;
end; $$;
create trigger school_membership_scope_sync
  after insert or update of status or delete on public.school_memberships
  for each row execute function app.sync_school_membership_scope();

alter table public.membership_roles enable row level security;
create policy membership_roles_read_scope on public.membership_roles for select to myschool_runtime
  using (user_id = auth.uid() or app.has_permission('users.read', tenant_id, school_id, class_id));
create policy membership_roles_insert_scope on public.membership_roles for insert to myschool_runtime
  with check (app.has_permission('users.manage', tenant_id, school_id, class_id) or app.has_permission('platform.roles.manage', null, null, null));
create policy membership_roles_delete_scope on public.membership_roles for delete to myschool_runtime
  using (app.has_permission('users.manage', tenant_id, school_id, class_id) or app.has_permission('platform.roles.manage', null, null, null));

alter table public.tenant_settings enable row level security;
create policy tenant_settings_read_scope on public.tenant_settings for select to myschool_runtime
  using (app.can_access_tenant(tenant_id));
create policy tenant_settings_update_scope on public.tenant_settings for update to myschool_runtime
  using (app.has_permission('tenant.settings.manage', tenant_id, null, null) or app.has_permission('platform.tenants.manage', null, null, null))
  with check (app.has_permission('tenant.settings.manage', tenant_id, null, null) or app.has_permission('platform.tenants.manage', null, null, null));
create policy tenant_settings_insert_scope on public.tenant_settings for insert to myschool_runtime
  with check (app.has_permission('tenant.settings.manage', tenant_id, null, null)
    or app.has_permission('platform.tenants.manage', null, null, null));

alter table public.audit_logs enable row level security;
create policy audit_logs_read_scope on public.audit_logs for select to myschool_runtime
  using (
    (tenant_id is not null and app.has_permission('audit.read', tenant_id, school_id, null))
    or app.has_permission('platform.audit.read', null, null, null)
  );
create policy audit_logs_insert_actor on public.audit_logs for insert to myschool_runtime
  with check (actor_user_id = auth.uid() or app.has_permission('audit.write', tenant_id, school_id, null));

-- Do not expose app tables to Supabase's anon/authenticated Data API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema app from anon, authenticated;
revoke all on app.user_effective_permissions, app.user_membership_scopes from anon, authenticated;

-- Backend role only. RLS is still enforced because the role is not table owner and has NOBYPASSRLS.
grant select, insert, update, delete on all tables in schema public to myschool_runtime;
grant usage, select on all sequences in schema public to myschool_runtime;
grant usage on schema app to myschool_runtime;
grant select, insert, delete on app.user_effective_permissions to myschool_runtime;
grant select, insert, update, delete on app.user_membership_scopes to myschool_runtime;
grant execute on function app.current_user_id() to myschool_runtime;
grant execute on function app.current_tenant_id() to myschool_runtime;
grant execute on function app.current_school_id() to myschool_runtime;
grant execute on function app.has_permission(text, uuid, uuid, uuid) to myschool_runtime;
grant execute on function app.can_access_tenant(uuid) to myschool_runtime;
grant execute on function app.can_access_school(uuid, uuid) to myschool_runtime;

-- Storage uses authenticated JWTs directly, but only the permission function is exposed.
grant usage on schema app to authenticated;
grant select on app.user_effective_permissions to authenticated;
grant select on app.user_membership_scopes to authenticated;
grant execute on function app.has_permission(text, uuid, uuid, uuid) to authenticated;

-- Built-in roles.
insert into public.roles(key, name, scope) values
 ('platform_owner','Platform Owner','platform'),
 ('platform_admin','Platform Admin','platform'),
 ('platform_support','Platform Support','platform'),
 ('finance','Finance','tenant'),
 ('sales','Sales','platform'),
 ('developer','Developer','platform'),
 ('tenant_owner','Tenant Owner','tenant'),
 ('school_owner','School Owner','school'),
 ('school_admin','School Admin','school'),
 ('supervisor','Supervisor','school'),
 ('teacher','Teacher','class'),
 ('student','Student','school'),
 ('parent','Parent','school')
on conflict (key) do nothing;

insert into public.permissions(key, description) values
 ('platform.tenants.read','Read tenants across the platform'),
 ('platform.tenants.manage','Create and manage tenants'),
 ('platform.schools.read','Read schools across the platform'),
 ('platform.schools.manage','Create and manage schools across the platform'),
 ('platform.roles.manage','Assign platform and tenant roles'),
 ('platform.audit.read','Read platform audit logs'),
 ('platform.support.read','Read support context'),
 ('platform.billing.manage','Manage platform billing'),
 ('tenant.settings.manage','Manage tenant configuration'),
 ('schools.read','Read schools and campuses'),
 ('schools.manage','Create and manage schools and campuses'),
 ('users.read','Read user memberships'),
 ('users.manage','Invite and manage school-scoped users and roles'),
 ('tenant.memberships.manage','Suspend or revoke tenant-wide memberships'),
 ('roles.read','Read roles and permissions'),
 ('roles.manage','Manage role assignments'),
 ('students.read','Read students in permitted scope'),
 ('students.manage','Create and update students'),
 ('teachers.read','Read teachers in permitted scope'),
 ('teachers.manage','Create and update teachers'),
 ('classes.read','Read classes in permitted scope'),
 ('classes.manage','Create and update classes and enrollments'),
 ('academics.read','Read academic years, subjects and terms'),
 ('academics.manage','Manage academic structure'),
 ('attendance.read','Read attendance'),
 ('attendance.manage','Record and edit attendance'),
 ('grades.read','Read assessments and grades'),
 ('grades.manage','Record and edit grades'),
 ('grades.publish','Publish approved grades'),
 ('assignments.read','Read assignments and submissions'),
 ('assignments.manage','Create and manage assignments'),
 ('assignments.submit','Submit student assignments'),
 ('reports.read','Read permitted school reports'),
 ('fees.read','Read student fee accounts'),
 ('fees.manage','Manage fee plans and installments'),
 ('fees.payments.record','Record fee payments'),
 ('files.read','Read permitted school files'),
 ('files.upload','Upload school files'),
 ('audit.read','Read school audit logs'),
 ('audit.write','Write audit events')
on conflict (key) do nothing;

-- Role-permission mapping. More restrictive class/parent access is enforced by scoped assignments and domain RLS.
with mapping(role_key, permission_key) as (values
 ('platform_owner','platform.tenants.read'),('platform_owner','platform.tenants.manage'),('platform_owner','platform.schools.read'),('platform_owner','platform.schools.manage'),('platform_owner','platform.roles.manage'),('platform_owner','platform.audit.read'),('platform_owner','platform.billing.manage'),('platform_owner','platform.support.read'),('platform_owner','tenant.memberships.manage'),('platform_owner','users.read'),('platform_owner','users.manage'),('platform_owner','roles.read'),('platform_owner','roles.manage'),
 ('platform_admin','platform.tenants.read'),('platform_admin','platform.tenants.manage'),('platform_admin','platform.schools.read'),('platform_admin','platform.schools.manage'),('platform_admin','platform.audit.read'),('platform_admin','platform.roles.manage'),('platform_admin','tenant.memberships.manage'),('platform_admin','users.read'),('platform_admin','users.manage'),('platform_admin','roles.read'),('platform_admin','roles.manage'),
 ('platform_support','platform.tenants.read'),('platform_support','platform.schools.read'),('platform_support','platform.support.read'),
 ('sales','platform.tenants.read'),('sales','platform.schools.read'),
 ('developer','platform.support.read'),
 ('finance','schools.read'),('finance','fees.read'),('finance','fees.manage'),('finance','fees.payments.record'),('finance','reports.read'),
 ('tenant_owner','schools.read'),('tenant_owner','schools.manage'),('tenant_owner','tenant.settings.manage'),('tenant_owner','tenant.memberships.manage'),('tenant_owner','users.read'),('tenant_owner','users.manage'),('tenant_owner','roles.read'),('tenant_owner','roles.manage'),('tenant_owner','students.read'),('tenant_owner','students.manage'),('tenant_owner','teachers.read'),('tenant_owner','teachers.manage'),('tenant_owner','classes.read'),('tenant_owner','classes.manage'),('tenant_owner','academics.read'),('tenant_owner','academics.manage'),('tenant_owner','attendance.read'),('tenant_owner','attendance.manage'),('tenant_owner','grades.read'),('tenant_owner','grades.manage'),('tenant_owner','grades.publish'),('tenant_owner','assignments.read'),('tenant_owner','assignments.manage'),('tenant_owner','reports.read'),('tenant_owner','fees.read'),('tenant_owner','fees.manage'),('tenant_owner','fees.payments.record'),('tenant_owner','files.read'),('tenant_owner','files.upload'),('tenant_owner','audit.read'),('tenant_owner','audit.write'),
 ('school_owner','schools.read'),('school_owner','users.read'),('school_owner','users.manage'),('school_owner','roles.read'),('school_owner','roles.manage'),('school_owner','students.read'),('school_owner','students.manage'),('school_owner','teachers.read'),('school_owner','teachers.manage'),('school_owner','classes.read'),('school_owner','classes.manage'),('school_owner','academics.read'),('school_owner','academics.manage'),('school_owner','attendance.read'),('school_owner','attendance.manage'),('school_owner','grades.read'),('school_owner','grades.manage'),('school_owner','grades.publish'),('school_owner','assignments.read'),('school_owner','assignments.manage'),('school_owner','reports.read'),('school_owner','fees.read'),('school_owner','fees.manage'),('school_owner','fees.payments.record'),('school_owner','files.read'),('school_owner','files.upload'),('school_owner','audit.read'),('school_owner','audit.write'),
 ('school_admin','schools.read'),('school_admin','users.read'),('school_admin','users.manage'),('school_admin','roles.read'),('school_admin','roles.manage'),('school_admin','students.read'),('school_admin','students.manage'),('school_admin','teachers.read'),('school_admin','teachers.manage'),('school_admin','classes.read'),('school_admin','classes.manage'),('school_admin','academics.read'),('school_admin','academics.manage'),('school_admin','attendance.read'),('school_admin','attendance.manage'),('school_admin','grades.read'),('school_admin','grades.manage'),('school_admin','grades.publish'),('school_admin','assignments.read'),('school_admin','assignments.manage'),('school_admin','reports.read'),('school_admin','fees.read'),('school_admin','fees.manage'),('school_admin','fees.payments.record'),('school_admin','files.read'),('school_admin','files.upload'),('school_admin','audit.read'),('school_admin','audit.write'),
 ('supervisor','students.read'),('supervisor','teachers.read'),('supervisor','classes.read'),('supervisor','academics.read'),('supervisor','attendance.read'),('supervisor','attendance.manage'),('supervisor','grades.read'),('supervisor','assignments.read'),('supervisor','reports.read'),('supervisor','files.read'),('supervisor','audit.write'),
 ('teacher','students.read'),('teacher','teachers.read'),('teacher','classes.read'),('teacher','academics.read'),('teacher','attendance.read'),('teacher','attendance.manage'),('teacher','grades.read'),('teacher','grades.manage'),('teacher','assignments.read'),('teacher','assignments.manage'),('teacher','assignments.submit'),('teacher','files.read'),('teacher','files.upload'),('teacher','audit.write'),
 ('student','academics.read'),('student','assignments.submit'),
 ('parent','academics.read')
)
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from mapping m join public.roles r on r.key=m.role_key join public.permissions p on p.key=m.permission_key
on conflict do nothing;

commit;