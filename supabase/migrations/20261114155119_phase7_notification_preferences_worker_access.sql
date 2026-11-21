begin;
create policy notification_preferences_manager_read on public.notification_preferences
 for select to myschool_runtime
 using (
  user_id=(select auth.uid())
  or (
    tenant_id=app.current_tenant_id()
    and (school_id is null or app.has_permission('notifications.manage',tenant_id,school_id,null))
  )
 );
commit;