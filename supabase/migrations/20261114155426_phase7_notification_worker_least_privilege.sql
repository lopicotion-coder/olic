begin;
insert into public.permissions(key,description)
values('notifications.delivery.manage','Process notification deliveries, attempts, receipts and provider events')
on conflict(key) do nothing;

delete from public.role_permissions rp using public.roles r
where r.id=rp.role_id and r.key='notification_worker';
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='notifications.delivery.manage'
where r.key='notification_worker' on conflict do nothing;

-- The worker may read notification payloads for delivery, but cannot create or rewrite them.
create policy notifications_delivery_worker_read on public.notifications for select to myschool_runtime
 using(tenant_id=app.current_tenant_id()
   and app.has_permission('notifications.delivery.manage',tenant_id,school_id,null));

drop policy if exists notification_deliveries_manage on public.notification_deliveries;
create policy notification_deliveries_read on public.notification_deliveries for select to myschool_runtime
 using(tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',tenant_id,school_id,null)
     or app.has_permission('notifications.delivery.manage',tenant_id,school_id,null)));
create policy notification_deliveries_insert on public.notification_deliveries for insert to myschool_runtime
 with check(tenant_id=app.current_tenant_id()
   and app.has_permission('notifications.manage',tenant_id,school_id,null));
create policy notification_deliveries_update on public.notification_deliveries for update to myschool_runtime
 using(tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',tenant_id,school_id,null)
     or app.has_permission('notifications.delivery.manage',tenant_id,school_id,null)))
 with check(tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',tenant_id,school_id,null)
     or app.has_permission('notifications.delivery.manage',tenant_id,school_id,null)));
create policy notification_deliveries_delete on public.notification_deliveries for delete to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));

drop policy if exists notification_delivery_attempts_manage on public.notification_delivery_attempts;
create policy notification_delivery_attempts_read on public.notification_delivery_attempts for select to myschool_runtime
 using(exists(select 1 from public.notification_deliveries d where d.id=delivery_id and d.tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)
     or app.has_permission('notifications.delivery.manage',d.tenant_id,d.school_id,null))));
create policy notification_delivery_attempts_insert on public.notification_delivery_attempts for insert to myschool_runtime
 with check(exists(select 1 from public.notification_deliveries d where d.id=delivery_id and d.tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)
     or app.has_permission('notifications.delivery.manage',d.tenant_id,d.school_id,null))));
create policy notification_delivery_attempts_admin_update on public.notification_delivery_attempts for update to myschool_runtime
 using(exists(select 1 from public.notification_deliveries d where d.id=delivery_id and d.tenant_id=app.current_tenant_id()
   and app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)))
 with check(exists(select 1 from public.notification_deliveries d where d.id=delivery_id and d.tenant_id=app.current_tenant_id()
   and app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)));
create policy notification_delivery_attempts_admin_delete on public.notification_delivery_attempts for delete to myschool_runtime
 using(exists(select 1 from public.notification_deliveries d where d.id=delivery_id and d.tenant_id=app.current_tenant_id()
   and app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)));

drop policy if exists notification_delivery_dead_letters_manage on public.notification_delivery_dead_letters;
create policy notification_delivery_dead_letters_read on public.notification_delivery_dead_letters for select to myschool_runtime
 using(tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',tenant_id,school_id,null)
     or app.has_permission('notifications.delivery.manage',tenant_id,school_id,null)));
create policy notification_delivery_dead_letters_insert on public.notification_delivery_dead_letters for insert to myschool_runtime
 with check(tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',tenant_id,school_id,null)
     or app.has_permission('notifications.delivery.manage',tenant_id,school_id,null)));
create policy notification_delivery_dead_letters_admin_update on public.notification_delivery_dead_letters for update to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null))
 with check(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));
create policy notification_delivery_dead_letters_admin_delete on public.notification_delivery_dead_letters for delete to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));

drop policy if exists notification_provider_events_manage on public.notification_provider_events;
create policy notification_provider_events_read on public.notification_provider_events for select to myschool_runtime
 using(tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',tenant_id,school_id,null)
     or app.has_permission('notifications.delivery.manage',tenant_id,school_id,null)));
create policy notification_provider_events_insert on public.notification_provider_events for insert to myschool_runtime
 with check(tenant_id=app.current_tenant_id()
   and (app.has_permission('notifications.manage',tenant_id,school_id,null)
     or app.has_permission('notifications.delivery.manage',tenant_id,school_id,null)));
create policy notification_provider_events_admin_update on public.notification_provider_events for update to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null))
 with check(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));
create policy notification_provider_events_admin_delete on public.notification_provider_events for delete to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));

drop policy if exists user_push_devices_worker_read on public.user_push_devices;
create policy user_push_devices_worker_read on public.user_push_devices for select to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.delivery.manage',tenant_id,school_id,null));
drop policy if exists user_push_devices_worker_update on public.user_push_devices;
create policy user_push_devices_worker_update on public.user_push_devices for update to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.delivery.manage',tenant_id,school_id,null))
 with check(tenant_id=app.current_tenant_id() and app.has_permission('notifications.delivery.manage',tenant_id,school_id,null));

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
     if not app.has_permission('notifications.delivery.manage',old.tenant_id,old.school_id,null)
       or new.is_active is distinct from false then
       raise exception 'Delivery workers may only deactivate invalid push devices';
     end if;
   end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;

drop policy if exists notification_preferences_manager_read on public.notification_preferences;
create policy notification_preferences_manager_read on public.notification_preferences for select to myschool_runtime
 using(user_id=(select auth.uid())
   or (tenant_id=app.current_tenant_id()
     and (school_id is null
       or app.has_permission('notifications.manage',tenant_id,school_id,null)
       or app.has_permission('notifications.delivery.manage',tenant_id,school_id,null))));

drop policy if exists profiles_notification_delivery_read on public.profiles;
create policy profiles_notification_delivery_read on public.profiles for select to myschool_runtime
 using(exists(select 1 from public.notification_deliveries d
   where d.recipient_user_id=profiles.id and d.tenant_id=app.current_tenant_id()
     and (app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)
       or app.has_permission('notifications.delivery.manage',d.tenant_id,d.school_id,null))));

commit;