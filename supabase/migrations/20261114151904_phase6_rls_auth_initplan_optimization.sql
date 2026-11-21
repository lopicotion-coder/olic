do $$
declare
  p record;
  v_using text;
  v_check text;
  v_stmt text;
  changed integer := 0;
begin
  for p in
    select n.nspname as schema_name, c.relname as table_name, pol.polname,
           pol.polqual, pol.polwithcheck
      from pg_policy pol
      join pg_class c on c.oid=pol.polrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname in ('public','app')
       and (
         coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') ~* 'auth\.(uid|jwt)\(\)'
         or coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'') ~* 'auth\.(uid|jwt)\(\)'
       )
  loop
    v_using := case when p.polqual is null then null
      else regexp_replace(pg_get_expr(p.polqual,format('%I.%I',p.schema_name,p.table_name)::regclass),
        'auth\.(uid|jwt)\(\)', '(select auth.\1())', 'gi') end;
    v_check := case when p.polwithcheck is null then null
      else regexp_replace(pg_get_expr(p.polwithcheck,format('%I.%I',p.schema_name,p.table_name)::regclass),
        'auth\.(uid|jwt)\(\)', '(select auth.\1())', 'gi') end;
    v_stmt := format('alter policy %I on %I.%I',p.polname,p.schema_name,p.table_name);
    if v_using is not null then v_stmt := v_stmt || format(' using (%s)',v_using); end if;
    if v_check is not null then v_stmt := v_stmt || format(' with check (%s)',v_check); end if;
    execute v_stmt;
    changed := changed + 1;
  end loop;
  raise notice 'Optimized % RLS policies for auth init-plan evaluation',changed;
end $$;