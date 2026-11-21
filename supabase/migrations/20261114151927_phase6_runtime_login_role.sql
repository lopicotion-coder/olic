do $$
begin
  if not exists (select 1 from pg_roles where rolname='myschool_login') then
    create role myschool_login
      login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
      connection limit 20;
  end if;
end $$;
grant myschool_runtime to myschool_login;
grant connect on database postgres to myschool_login;