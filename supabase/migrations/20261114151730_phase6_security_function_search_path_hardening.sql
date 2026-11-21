begin;

create or replace function app.current_user_id() returns uuid
language sql stable
set search_path = pg_catalog, auth
as $$ select auth.uid() $$;

create or replace function app.current_tenant_id() returns uuid
language sql stable
set search_path = pg_catalog
as $$ select nullif(current_setting('app.current_tenant_id', true), '')::uuid $$;

create or replace function app.current_school_id() returns uuid
language sql stable
set search_path = pg_catalog
as $$ select nullif(current_setting('app.current_school_id', true), '')::uuid $$;

commit;