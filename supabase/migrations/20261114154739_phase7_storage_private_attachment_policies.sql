begin;
create or replace function app.is_communication_storage_path(p_name text)
returns boolean language sql immutable security invoker set search_path=pg_catalog as $$
 select coalesce(
  (split_part(p_name,'/',3)='school' and split_part(p_name,'/',4) in ('message','support-ticket'))
  or (split_part(p_name,'/',3)='class' and split_part(p_name,'/',5)='message'),false)
$$;

create or replace function app.can_access_general_storage_path(p_name text,p_action text)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,app as $$
declare parts text[];
begin
 if auth.uid() is null or app.is_communication_storage_path(p_name) then return false; end if;
 if p_action not in ('read','insert','update','delete') then return false; end if;
 parts:=string_to_array(p_name,'/');
 if cardinality(parts)<5
   or parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   or parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
 if parts[3]='school' then
   if p_action='read' then return app.has_permission('files.read',parts[1]::uuid,parts[2]::uuid,null); end if;
   return app.has_permission('files.upload',parts[1]::uuid,parts[2]::uuid,null);
 elsif parts[3]='class' and parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   if p_action='read' then return app.has_permission('files.read',parts[1]::uuid,parts[2]::uuid,parts[4]::uuid); end if;
   return app.has_permission('files.upload',parts[1]::uuid,parts[2]::uuid,parts[4]::uuid);
 elsif parts[3]='student' and parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   if p_action='read' then
     return app.is_student_owner_in_school(parts[4]::uuid,parts[1]::uuid,parts[2]::uuid)
       or app.is_guardian_of_student_in_school(parts[4]::uuid,parts[1]::uuid,parts[2]::uuid)
       or app.has_permission('students.read',parts[1]::uuid,parts[2]::uuid,null);
   elsif p_action='insert' then
     return app.is_student_owner_in_school(parts[4]::uuid,parts[1]::uuid,parts[2]::uuid)
       and app.has_permission('assignments.submit',parts[1]::uuid,parts[2]::uuid,null);
   end if;
 end if;
 return false;
end $$;

create or replace function app.can_access_communication_storage_path(p_name text)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,app as $$
declare parts text[];
begin
 if auth.uid() is null or not app.is_communication_storage_path(p_name) then return false; end if;
 parts:=string_to_array(p_name,'/');
 if cardinality(parts)<6
  or parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
 if parts[3]='school' and parts[4]='support-ticket' and cardinality(parts)>=6
  and parts[5] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  return app.can_access_ticket(parts[5]::uuid,parts[1]::uuid,parts[2]::uuid);
 elsif parts[3]='school' and parts[4]='message' and cardinality(parts)>=6
  and parts[5] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  return app.can_access_conversation(parts[5]::uuid,parts[1]::uuid,parts[2]::uuid);
 elsif parts[3]='class' and cardinality(parts)>=7
  and parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and parts[5]='message'
  and parts[6] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  return app.can_access_conversation(parts[6]::uuid,parts[1]::uuid,parts[2]::uuid);
 end if;
 return false;
end $$;

revoke all on function app.is_communication_storage_path(text) from public,anon;
revoke all on function app.can_access_general_storage_path(text,text) from public,anon;
revoke all on function app.can_access_communication_storage_path(text) from public,anon;
grant usage on schema app to authenticated;
grant execute on function app.is_communication_storage_path(text) to authenticated,myschool_runtime;
grant execute on function app.can_access_general_storage_path(text,text) to authenticated;
grant execute on function app.can_access_communication_storage_path(text) to authenticated;
grant execute on function app.can_access_ticket(uuid,uuid,uuid) to authenticated;
grant execute on function app.can_access_conversation(uuid,uuid,uuid) to authenticated;

drop policy if exists school_files_read on storage.objects;
create policy school_files_read on storage.objects for select to authenticated
 using(bucket_id='school-files' and app.can_access_general_storage_path(name,'read'));
drop policy if exists school_files_insert on storage.objects;
create policy school_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='school-files' and app.can_access_general_storage_path(name,'insert'));
drop policy if exists school_files_update on storage.objects;
create policy school_files_update on storage.objects for update to authenticated
 using(bucket_id='school-files' and app.can_access_general_storage_path(name,'update'))
 with check(bucket_id='school-files' and app.can_access_general_storage_path(name,'update'));
drop policy if exists school_files_delete on storage.objects;
create policy school_files_delete on storage.objects for delete to authenticated
 using(bucket_id='school-files' and app.can_access_general_storage_path(name,'delete'));

create policy school_files_comm_attachment_read on storage.objects for select to authenticated
 using(bucket_id='school-files' and app.can_access_communication_storage_path(name));
create policy school_files_comm_attachment_insert on storage.objects for insert to authenticated
 with check(bucket_id='school-files' and app.can_access_communication_storage_path(name));
create policy school_files_comm_attachment_delete on storage.objects for delete to authenticated
 using(bucket_id='school-files' and owner_id=(select auth.uid())::text
  and app.can_access_communication_storage_path(name));
commit;