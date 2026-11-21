begin;
alter table public.user_push_devices drop constraint if exists user_push_devices_user_id_provider_key_push_token_key;
create unique index user_push_devices_school_token_uidx
 on public.user_push_devices(user_id,tenant_id,school_id,provider_key,push_token);

drop policy if exists user_push_devices_worker_read on public.user_push_devices;
create policy user_push_devices_worker_read on public.user_push_devices for select to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));
drop policy if exists user_push_devices_worker_update on public.user_push_devices;
create policy user_push_devices_worker_update on public.user_push_devices for update to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null))
 with check(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));

create or replace function app.guard_push_device_write() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
 if not app.is_active_school_member(new.user_id,new.tenant_id,new.school_id) then
   raise exception 'Push device must belong to an active school membership';
 end if;
 if tg_op='INSERT' then
   if new.user_id is distinct from auth.uid() then
     raise exception 'Push devices must be registered by the authenticated user';
   end if;
 else
   if new.user_id is distinct from old.user_id or new.tenant_id is distinct from old.tenant_id
      or new.school_id is distinct from old.school_id or new.push_token is distinct from old.push_token
      or new.provider_key is distinct from old.provider_key or new.platform is distinct from old.platform then
     raise exception 'Push device ownership, scope, platform and token are immutable';
   end if;
   if old.user_id is distinct from auth.uid() then
     if not app.has_permission('notifications.manage',old.tenant_id,old.school_id,null)
        or new.is_active is distinct from false then
       raise exception 'Notification managers may only deactivate a device in their tenant scope';
     end if;
   end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;
commit;