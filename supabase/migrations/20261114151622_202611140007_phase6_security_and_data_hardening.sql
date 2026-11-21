begin;

-- RLS access helpers read their own protected parent rows. SECURITY DEFINER avoids recursive
-- policy evaluation; the fixed search_path and row_security=off make the functions fail closed.
create or replace function app.can_access_notification(p_notification_id uuid, p_tenant_id uuid, p_school_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, app, auth set row_security = off as $$
  select exists(select 1 from public.notifications n where n.id=p_notification_id and n.tenant_id=p_tenant_id
    and app.can_access_tenant(n.tenant_id)
    and (n.school_id is null or app.can_access_school(n.tenant_id,n.school_id))
    and (n.recipient_user_id=auth.uid()
      or (n.recipient_user_id is null and (n.class_id is null or app.can_access_class(n.class_id,n.tenant_id,n.school_id)))
      or app.has_permission('notifications.manage',n.tenant_id,n.school_id,n.class_id)));
$$;

create or replace function app.can_access_conversation(p_conversation_id uuid, p_tenant_id uuid, p_school_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, app, auth set row_security = off as $$
  select exists(select 1 from public.conversations c
    left join public.conversation_participants cp on cp.conversation_id=c.id and cp.user_id=auth.uid()
    where c.id=p_conversation_id and c.tenant_id=p_tenant_id and c.school_id is not distinct from p_school_id
      and app.can_access_tenant(c.tenant_id) and (c.school_id is null or app.can_access_school(c.tenant_id,c.school_id))
      and (cp.user_id is not null
        or (c.class_id is not null and app.can_access_class(c.class_id,c.tenant_id,c.school_id) and app.can_access_school(c.tenant_id,c.school_id))
        or (c.scope_type='school' and app.can_access_school(c.tenant_id,c.school_id))
        or (c.scope_type='support' and (app.has_permission('support.read',c.tenant_id,c.school_id,null)
          or app.has_permission('support.manage',c.tenant_id,c.school_id,null)))
        or c.created_by=auth.uid()
        or app.has_permission('conversations.manage',c.tenant_id,c.school_id,c.class_id)));
$$;

create or replace function app.can_access_ticket(p_ticket_id uuid, p_tenant_id uuid, p_school_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, app, auth set row_security = off as $$
  select exists(select 1 from public.support_tickets t where t.id=p_ticket_id and t.tenant_id=p_tenant_id
    and t.school_id is not distinct from p_school_id
    and app.can_access_tenant(t.tenant_id) and (t.school_id is null or app.can_access_school(t.tenant_id,t.school_id))
    and (t.created_by=auth.uid() or t.created_for_user_id=auth.uid() or t.assigned_to_user_id=auth.uid()
      or app.has_permission('support.read',t.tenant_id,t.school_id,null)
      or app.has_permission('support.manage',t.tenant_id,t.school_id,null)));
$$;

create or replace function app.can_access_content_item(p_item_id uuid, p_tenant_id uuid, p_school_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, app, auth set row_security = off as $$
  select exists(select 1 from public.content_items c where c.id=p_item_id and c.tenant_id=p_tenant_id
    and c.school_id is not distinct from p_school_id
    and app.can_access_tenant(c.tenant_id) and app.can_access_school(c.tenant_id,c.school_id)
    and ((c.status='published' and (c.class_id is null or app.can_access_class(c.class_id,c.tenant_id,c.school_id)))
      or app.has_permission('content.manage',c.tenant_id,c.school_id,c.class_id)));
$$;

create or replace function app.can_access_ai_request(p_request_id uuid, p_tenant_id uuid, p_school_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, app, auth set row_security = off as $$
  select exists(select 1 from public.ai_requests r where r.id=p_request_id and r.tenant_id=p_tenant_id
    and r.school_id is not distinct from p_school_id
    and app.can_access_tenant(r.tenant_id) and (r.school_id is null or app.can_access_school(r.tenant_id,r.school_id))
    and (r.requester_user_id=auth.uid() or app.has_permission('ai.read',r.tenant_id,r.school_id,null)
      or app.has_permission('ai.manage',r.tenant_id,r.school_id,null)));
$$;

create or replace function app.is_conversation_creator(p_conversation_id uuid,p_tenant_id uuid,p_school_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, app, auth set row_security = off as $$
  select exists(select 1 from public.conversations c where c.id=p_conversation_id and c.tenant_id=p_tenant_id
    and c.school_id is not distinct from p_school_id and c.created_by=auth.uid());
$$;

create or replace function app.is_active_school_member(p_user_id uuid,p_tenant_id uuid,p_school_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, app, auth set row_security = off as $$
  select exists(select 1 from public.school_memberships sm where sm.user_id=p_user_id and sm.tenant_id=p_tenant_id
    and sm.school_id is not distinct from p_school_id and sm.status='active');
$$;

revoke all on function app.can_access_notification(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app.can_access_conversation(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app.can_access_ticket(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app.can_access_content_item(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app.can_access_ai_request(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app.is_conversation_creator(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app.is_active_school_member(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function app.can_access_notification(uuid,uuid,uuid) to myschool_runtime;
grant execute on function app.can_access_conversation(uuid,uuid,uuid) to myschool_runtime;
grant execute on function app.can_access_ticket(uuid,uuid,uuid) to myschool_runtime;
grant execute on function app.can_access_content_item(uuid,uuid,uuid) to myschool_runtime;
grant execute on function app.can_access_ai_request(uuid,uuid,uuid) to myschool_runtime;
grant execute on function app.is_conversation_creator(uuid,uuid,uuid) to myschool_runtime;
grant execute on function app.is_active_school_member(uuid,uuid,uuid) to myschool_runtime;

-- Conversation access must be recursion-free, and a creator must be able to read the row before membership insertion.
drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations for select to myschool_runtime
  using (app.can_access_conversation(id,tenant_id,school_id));
drop policy if exists conversation_participants_read on public.conversation_participants;
create policy conversation_participants_read on public.conversation_participants for select to myschool_runtime
  using (app.can_access_conversation(conversation_id,tenant_id,school_id));
drop policy if exists conversation_participants_write on public.conversation_participants;
create policy conversation_participants_insert on public.conversation_participants for insert to myschool_runtime
  with check (app.has_permission('conversations.manage',tenant_id,school_id,null)
    or (app.is_conversation_creator(conversation_id,tenant_id,school_id)
      and app.is_active_school_member(auth.uid(),tenant_id,school_id)
      and app.is_active_school_member(user_id,tenant_id,school_id)));
create policy conversation_participants_update on public.conversation_participants for update to myschool_runtime
  using (app.has_permission('conversations.manage',tenant_id,school_id,null))
  with check (app.has_permission('conversations.manage',tenant_id,school_id,null));
create policy conversation_participants_delete on public.conversation_participants for delete to myschool_runtime
  using (user_id=auth.uid() or app.has_permission('conversations.manage',tenant_id,school_id,null));

drop policy if exists conversations_write on public.conversations;
create policy conversations_insert on public.conversations for insert to myschool_runtime
  with check (created_by=auth.uid() and app.can_access_tenant(tenant_id)
    and (school_id is null or app.can_access_school(tenant_id,school_id))
    and (class_id is null or app.can_access_class(class_id,tenant_id,school_id))
    and (scope_type<>'support' or app.has_permission('support.read',tenant_id,school_id,null)
      or app.has_permission('support.manage',tenant_id,school_id,null)));
create policy conversations_update on public.conversations for update to myschool_runtime
  using (app.can_access_conversation(id,tenant_id,school_id))
  with check (app.can_access_conversation(id,tenant_id,school_id));
create policy conversations_delete on public.conversations for delete to myschool_runtime
  using (app.has_permission('conversations.manage',tenant_id,school_id,class_id));

create or replace function app.guard_conversation_update() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
  if not app.has_permission('conversations.manage',old.tenant_id,old.school_id,old.class_id) then
    if (to_jsonb(new)-array['last_message_at','updated_at']) is distinct from (to_jsonb(old)-array['last_message_at','updated_at']) then
      raise exception 'Conversation participants may only advance the last-message timestamp';
    end if;
    if new.last_message_at is null or (old.last_message_at is not null and new.last_message_at<old.last_message_at) then
      raise exception 'Conversation last-message timestamp cannot move backwards';
    end if;
    new.updated_at:=now();
  end if;
  return new;
end;
$$;
drop trigger if exists guard_conversation_update on public.conversations;
create trigger guard_conversation_update before update on public.conversations for each row execute function app.guard_conversation_update();

-- Restrict every message mutation to the author or an authorized moderator.
drop policy if exists messages_write on public.messages;
create policy messages_insert on public.messages for insert to myschool_runtime
  with check (sender_user_id=auth.uid() and app.can_access_conversation(conversation_id,tenant_id,school_id));
create policy messages_update on public.messages for update to myschool_runtime
  using (app.can_access_conversation(conversation_id,tenant_id,school_id)
    and ((sender_user_id=auth.uid() and created_at>=now()-interval '15 minutes')
      or app.has_permission('conversations.manage',tenant_id,school_id,null)))
  with check (app.can_access_conversation(conversation_id,tenant_id,school_id)
    and (sender_user_id=auth.uid() or app.has_permission('conversations.manage',tenant_id,school_id,null)));
create policy messages_delete on public.messages for delete to myschool_runtime
  using (app.can_access_conversation(conversation_id,tenant_id,school_id)
    and ((sender_user_id=auth.uid() and created_at>=now()-interval '15 minutes')
      or app.has_permission('conversations.manage',tenant_id,school_id,null)));
create or replace function app.guard_message_update() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
  if old.sender_user_id=auth.uid() and not app.has_permission('conversations.manage',old.tenant_id,old.school_id,null) then
    if (to_jsonb(new)-array['body','edited_at','deleted_at'])
       is distinct from (to_jsonb(old)-array['body','edited_at','deleted_at']) then
      raise exception 'Message authors cannot move or reassign a message';
    end if;
    if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
      raise exception 'Deleted messages cannot be restored by the author';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_message_update on public.messages;
create trigger guard_message_update before update on public.messages
  for each row execute function app.guard_message_update();
drop policy if exists message_edits_write on public.message_edits;
create policy message_edits_insert on public.message_edits for insert to myschool_runtime
  with check (edited_by=auth.uid() and exists(select 1 from public.messages m where m.id=message_id
    and app.can_access_conversation(m.conversation_id,m.tenant_id,m.school_id)
    and ((m.sender_user_id=auth.uid() and m.created_at>=now()-interval '15 minutes')
      or app.has_permission('conversations.manage',m.tenant_id,m.school_id,null))));
drop policy if exists message_deletions_write on public.message_deletions;
create policy message_deletions_insert on public.message_deletions for insert to myschool_runtime
  with check (deleted_by=auth.uid() and exists(select 1 from public.messages m where m.id=message_id
    and app.can_access_conversation(m.conversation_id,m.tenant_id,m.school_id)
    and ((m.sender_user_id=auth.uid() and m.created_at>=now()-interval '15 minutes')
      or app.has_permission('conversations.manage',m.tenant_id,m.school_id,null))));

-- Ticket visibility follows the parent ticket; requesters cannot change support ownership/status.
drop policy if exists support_tickets_write on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to myschool_runtime
  with check (created_by=auth.uid() and (app.has_permission('support.create',tenant_id,school_id,null)
    or app.has_permission('support.manage',tenant_id,school_id,null)));
create policy support_tickets_update on public.support_tickets for update to myschool_runtime
  using (app.has_permission('support.manage',tenant_id,school_id,null))
  with check (app.has_permission('support.manage',tenant_id,school_id,null));
create policy support_tickets_delete on public.support_tickets for delete to myschool_runtime
  using (app.has_permission('support.manage',tenant_id,school_id,null));
create or replace function app.guard_support_ticket_insert() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
  if not app.has_permission('support.manage',new.tenant_id,new.school_id,null) then
    if new.created_by is distinct from auth.uid() or new.created_for_user_id is not null or new.assigned_to_user_id is not null then
      raise exception 'Only support managers may create tickets for another user or assign tickets';
    end if;
    if not app.can_access_tenant(new.tenant_id) or (new.school_id is not null and not app.can_access_school(new.tenant_id,new.school_id)) then
      raise exception 'Ticket scope is outside the current user membership';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_support_ticket_insert on public.support_tickets;
create trigger guard_support_ticket_insert before insert on public.support_tickets
  for each row execute function app.guard_support_ticket_insert();
drop policy if exists ticket_messages_read on public.ticket_messages;
create policy ticket_messages_read on public.ticket_messages for select to myschool_runtime
  using (app.can_access_ticket(ticket_id,tenant_id,school_id));
drop policy if exists ticket_messages_write on public.ticket_messages;
create policy ticket_messages_insert on public.ticket_messages for insert to myschool_runtime
  with check (sender_user_id=auth.uid() and app.can_access_ticket(ticket_id,tenant_id,school_id)
    and (message_type<>'internal_note' or app.has_permission('support.manage',tenant_id,school_id,null)));
create policy ticket_messages_update on public.ticket_messages for update to myschool_runtime
  using (app.has_permission('support.manage',tenant_id,school_id,null))
  with check (app.has_permission('support.manage',tenant_id,school_id,null));
create policy ticket_messages_delete on public.ticket_messages for delete to myschool_runtime
  using (app.has_permission('support.manage',tenant_id,school_id,null));
drop policy if exists ticket_attachments_read on public.ticket_attachments;
create policy ticket_attachments_read on public.ticket_attachments for select to myschool_runtime
  using (exists(select 1 from public.ticket_messages m where m.id=ticket_message_id
    and m.tenant_id=ticket_attachments.tenant_id and app.can_access_ticket(m.ticket_id,m.tenant_id,m.school_id)));
drop policy if exists ticket_attachments_write on public.ticket_attachments;
create policy ticket_attachments_insert on public.ticket_attachments for insert to myschool_runtime
  with check (exists(select 1 from public.ticket_messages m where m.id=ticket_message_id
    and m.tenant_id=ticket_attachments.tenant_id and m.school_id is not distinct from ticket_attachments.school_id
    and (m.sender_user_id=auth.uid() or app.has_permission('support.manage',m.tenant_id,m.school_id,null))
    and app.can_access_ticket(m.ticket_id,m.tenant_id,m.school_id)));
create policy ticket_attachments_delete on public.ticket_attachments for delete to myschool_runtime
  using (app.has_permission('support.manage',tenant_id,school_id,null));

-- Recipient users may mark direct notifications read, but cannot rewrite the notification payload.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read_phase6 on public.notifications for select to myschool_runtime
  using ((recipient_user_id=auth.uid() and app.can_access_tenant(tenant_id)
      and (school_id is null or app.can_access_school(tenant_id,school_id)))
    or (recipient_user_id is null and app.can_access_tenant(tenant_id)
      and (school_id is null or app.can_access_school(tenant_id,school_id))
      and (class_id is null or app.can_access_class(class_id,tenant_id,school_id)))
    or app.has_permission('notifications.manage',tenant_id,school_id,class_id));
drop policy if exists notifications_write on public.notifications;
create policy notifications_insert_manage on public.notifications for insert to myschool_runtime
  with check (sender_user_id=auth.uid() and app.has_permission('notifications.manage',tenant_id,school_id,class_id)
    and app.can_access_tenant(tenant_id) and school_id is not null and app.can_access_school(tenant_id,school_id)
    and (class_id is null or app.can_access_class(class_id,tenant_id,school_id)));
create policy notifications_update_manage on public.notifications for update to myschool_runtime
  using (app.has_permission('notifications.manage',tenant_id,school_id,class_id))
  with check (app.has_permission('notifications.manage',tenant_id,school_id,class_id));
create policy notifications_delete_manage on public.notifications for delete to myschool_runtime
  using (app.has_permission('notifications.manage',tenant_id,school_id,class_id));
create policy notifications_mark_read_self on public.notifications for update to myschool_runtime
  using (recipient_user_id=auth.uid() and app.can_access_tenant(tenant_id)
    and (school_id is null or app.can_access_school(tenant_id,school_id)))
  with check (recipient_user_id=auth.uid() and app.can_access_tenant(tenant_id)
    and (school_id is null or app.can_access_school(tenant_id,school_id)));
create or replace function app.guard_recipient_notification_update() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
  if old.recipient_user_id=auth.uid() and not app.has_permission('notifications.manage',old.tenant_id,old.school_id,old.class_id) then
    if (to_jsonb(new)-array['is_read','read_at','updated_at']) is distinct from (to_jsonb(old)-array['is_read','read_at','updated_at']) then
      raise exception 'Recipients may only update their own read state';
    end if;
    if new.is_read is distinct from true then raise exception 'Recipients may only mark notifications as read'; end if;
    new.read_at:=coalesce(old.read_at,now());
    new.updated_at:=now();
  end if;
  return new;
end;
$$;
drop trigger if exists guard_recipient_notification_update on public.notifications;
create trigger guard_recipient_notification_update before update on public.notifications
  for each row execute function app.guard_recipient_notification_update();
create or replace function app.guard_notification_insert() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
  if new.sender_user_id is distinct from auth.uid() then
    raise exception 'Notification sender must match the authenticated user';
  end if;
  if new.school_id is null or not app.can_access_tenant(new.tenant_id) or not app.can_access_school(new.tenant_id,new.school_id) then
    raise exception 'Notification scope is outside the current user membership';
  end if;
  if new.class_id is not null and not app.can_access_class(new.class_id,new.tenant_id,new.school_id) then
    raise exception 'Notification class is outside the current user membership';
  end if;
  if new.recipient_user_id is not null and not app.is_active_school_member(new.recipient_user_id,new.tenant_id,new.school_id) then
    raise exception 'Notification recipient must be an active member of the same school';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_notification_insert on public.notifications;
create trigger guard_notification_insert before insert on public.notifications
  for each row execute function app.guard_notification_insert();

drop policy if exists notification_preferences_self on public.notification_preferences;
create policy notification_preferences_self on public.notification_preferences for all to myschool_runtime
  using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Enforce composite scope integrity for import rows and case-insensitive duplicate prevention.
alter table public.school_import_batches add constraint school_import_batches_id_scope_unique unique(id,tenant_id,school_id);
alter table public.school_import_rows drop constraint if exists school_import_rows_batch_id_fkey;
alter table public.school_import_rows add constraint school_import_rows_batch_scope_fkey
  foreign key(batch_id,tenant_id,school_id) references public.school_import_batches(id,tenant_id,school_id) on delete cascade;
do $$ begin
  if exists(select 1 from public.students where student_number is not null group by school_id,lower(student_number) having count(*)>1) then
    raise exception 'Duplicate student numbers ignoring case must be resolved before Phase 6 hardening';
  end if;
  if exists(select 1 from public.teachers where employee_number is not null group by school_id,lower(employee_number) having count(*)>1) then
    raise exception 'Duplicate employee numbers ignoring case must be resolved before Phase 6 hardening';
  end if;
  if exists(select 1 from public.teachers where email is not null group by school_id,lower(email) having count(*)>1) then
    raise exception 'Duplicate teacher emails ignoring case must be resolved before Phase 6 hardening';
  end if;
  if exists(select 1 from public.grade_publication_requests where status in ('pending','approved') group by assessment_id having count(*)>1) then
    raise exception 'Multiple active grade publication requests must be resolved before Phase 6 hardening';
  end if;
end $$;
create unique index students_school_student_number_ci_uidx on public.students(school_id,lower(student_number));
create unique index teachers_school_employee_number_ci_uidx on public.teachers(school_id,lower(employee_number)) where employee_number is not null;
create unique index teachers_school_email_ci_uidx on public.teachers(school_id,lower(email)) where email is not null;
create unique index grade_publication_active_request_uidx on public.grade_publication_requests(assessment_id) where status in ('pending','approved');

revoke all on function app.guard_conversation_update() from public,anon,authenticated;
grant execute on function app.guard_conversation_update() to myschool_runtime;
revoke all on function app.guard_message_update() from public,anon,authenticated;
grant execute on function app.guard_message_update() to myschool_runtime;
revoke all on function app.guard_support_ticket_insert() from public,anon,authenticated;
grant execute on function app.guard_support_ticket_insert() to myschool_runtime;
revoke all on function app.guard_recipient_notification_update() from public,anon,authenticated;
grant execute on function app.guard_recipient_notification_update() to myschool_runtime;
revoke all on function app.guard_notification_insert() from public,anon,authenticated;
grant execute on function app.guard_notification_insert() to myschool_runtime;

revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
grant select,insert,update,delete on all tables in schema public to myschool_runtime;
grant usage,select on all sequences in schema public to myschool_runtime;
alter default privileges in schema public grant select,insert,update,delete on tables to myschool_runtime;
alter default privileges in schema public grant usage,select on sequences to myschool_runtime;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke all on sequences from anon,authenticated;

commit;