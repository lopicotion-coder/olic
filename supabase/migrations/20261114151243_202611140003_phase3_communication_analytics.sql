
-- My School / Phase 3-4 Communication, Reports, and AI foundations
begin;

create type public.notification_type as enum ('announcement','direct','reminder','alert');
create type public.conversation_scope as enum ('direct','school','class','support');
create type public.ticket_status as enum ('open','in_progress','waiting','resolved','closed');
create type public.ticket_priority as enum ('low','normal','high','urgent');
create type public.ai_feature_key as enum ('tutor','teacher_assistant','exam_generator','document_understanding','analytics','moderation','search');
create type public.ai_request_status as enum ('queued','processing','completed','failed','blocked');
create type public.content_status as enum ('draft','published','archived');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  class_id uuid,
  title text not null,
  body text not null,
  notification_type public.notification_type not null default 'announcement',
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete cascade
);
create index notifications_recipient_idx on public.notifications(recipient_user_id, created_at desc);
create index notifications_school_idx on public.notifications(tenant_id, school_id, created_at desc);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid,
  school_id uuid,
  channel_push boolean not null default true,
  channel_email boolean not null default false,
  channel_in_app boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid,
  scope_type public.conversation_scope not null default 'direct',
  title text,
  class_id uuid,
  student_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete cascade,
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete cascade
);
create index conversations_scope_idx on public.conversations(tenant_id, school_id, scope_type, last_message_at desc nulls last);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null default 'member',
  joined_at timestamptz not null default now(),
  muted_at timestamptz,
  primary key (conversation_id, user_id),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create index conversation_participants_user_idx on public.conversation_participants(user_id, conversation_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid,
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null,
  message_type text not null default 'text',
  reply_to_message_id uuid references public.messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create index messages_conversation_idx on public.messages(conversation_id, created_at asc);

create table public.message_edits (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  edited_by uuid references auth.users(id) on delete set null,
  previous_body text not null,
  new_body text not null,
  edited_at timestamptz not null default now()
);

create table public.message_deletions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  deleted_by uuid references auth.users(id) on delete set null,
  reason text,
  deleted_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_for_user_id uuid references auth.users(id) on delete set null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null,
  category text not null default 'general',
  status public.ticket_status not null default 'open',
  priority public.ticket_priority not null default 'normal',
  source text not null default 'in_app',
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create index support_tickets_scope_idx on public.support_tickets(tenant_id, school_id, status, priority, created_at desc);

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid,
  sender_user_id uuid references auth.users(id) on delete set null,
  message_body text not null,
  message_type text not null default 'text',
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_message_id uuid not null references public.ticket_messages(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.ticket_slas (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.support_tickets(id) on delete cascade,
  response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  breached_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_provider_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid,
  feature_key public.ai_feature_key not null,
  provider_key text not null,
  model_key text not null,
  enabled boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid,
  feature_key public.ai_feature_key not null,
  name text not null,
  template_text text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  feature_key public.ai_feature_key not null,
  provider_key text,
  model_key text,
  prompt_text text not null,
  input_context jsonb not null default '{}'::jsonb,
  status public.ai_request_status not null default 'queued',
  safety_status text not null default 'pending',
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_amount numeric(18,4) not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create index ai_requests_scope_idx on public.ai_requests(tenant_id, school_id, feature_key, created_at desc);

create table public.ai_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.ai_requests(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid,
  response_text text not null,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.ai_requests(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  feature_key public.ai_feature_key not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_amount numeric(18,4) not null default 0,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.safety_filters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid,
  feature_key public.ai_feature_key not null,
  rule_name text not null,
  rule_definition jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  class_id uuid,
  subject_id uuid,
  title text not null,
  summary text,
  body text not null,
  resource_type text not null default 'lesson',
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete cascade,
  foreign key (subject_id, tenant_id, school_id) references public.subjects(id, tenant_id, school_id) on delete cascade
);
create index content_items_scope_idx on public.content_items(tenant_id, school_id, status, created_at desc);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid not null,
  version_number integer not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  unique (content_item_id, version_number)
);

create table public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid,
  snapshot_type text not null,
  summary jsonb not null default '{}'::jsonb,
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.early_warning_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  severity text not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

insert into public.permissions(key, description) values
  ('notifications.read','Read in-app notifications'),
  ('notifications.manage','Send and manage notifications'),
  ('conversations.read','Read conversations and messages'),
  ('conversations.create','Create conversations'),
  ('conversations.manage','Moderate conversations'),
  ('support.create','Create support tickets'),
  ('support.read','Read support tickets and replies'),
  ('support.manage','Manage support queues and assignments'),
  ('ai.use','Submit AI requests'),
  ('ai.read','Review AI request logs and outputs'),
  ('ai.manage','Configure AI routes and templates'),
  ('content.read','Read learning content'),
  ('content.manage','Create and publish learning content'),
  ('analytics.read','Read analytics and report views')
on conflict (key) do nothing;

with mapping(role_key, permission_key) as (values
  ('platform_owner','notifications.read'),('platform_owner','notifications.manage'),('platform_owner','conversations.read'),('platform_owner','conversations.create'),('platform_owner','conversations.manage'),('platform_owner','support.create'),('platform_owner','support.read'),('platform_owner','support.manage'),('platform_owner','ai.use'),('platform_owner','ai.read'),('platform_owner','ai.manage'),('platform_owner','content.read'),('platform_owner','content.manage'),('platform_owner','analytics.read'),
  ('platform_admin','notifications.read'),('platform_admin','notifications.manage'),('platform_admin','conversations.read'),('platform_admin','conversations.create'),('platform_admin','conversations.manage'),('platform_admin','support.read'),('platform_admin','support.manage'),('platform_admin','ai.use'),('platform_admin','ai.read'),('platform_admin','ai.manage'),('platform_admin','content.read'),('platform_admin','content.manage'),('platform_admin','analytics.read'),
  ('platform_support','support.read'),('platform_support','support.manage'),('platform_support','ai.read'),('platform_support','analytics.read'),
  ('tenant_owner','notifications.read'),('tenant_owner','notifications.manage'),('tenant_owner','conversations.read'),('tenant_owner','conversations.create'),('tenant_owner','conversations.manage'),('tenant_owner','support.create'),('tenant_owner','support.read'),('tenant_owner','support.manage'),('tenant_owner','ai.use'),('tenant_owner','ai.read'),('tenant_owner','ai.manage'),('tenant_owner','content.read'),('tenant_owner','content.manage'),('tenant_owner','analytics.read'),
  ('school_owner','notifications.read'),('school_owner','notifications.manage'),('school_owner','conversations.read'),('school_owner','conversations.create'),('school_owner','conversations.manage'),('school_owner','support.create'),('school_owner','support.read'),('school_owner','support.manage'),('school_owner','ai.use'),('school_owner','ai.read'),('school_owner','ai.manage'),('school_owner','content.read'),('school_owner','content.manage'),('school_owner','analytics.read'),
  ('school_admin','notifications.read'),('school_admin','notifications.manage'),('school_admin','conversations.read'),('school_admin','conversations.create'),('school_admin','conversations.manage'),('school_admin','support.create'),('school_admin','support.read'),('school_admin','support.manage'),('school_admin','ai.use'),('school_admin','ai.read'),('school_admin','ai.manage'),('school_admin','content.read'),('school_admin','content.manage'),('school_admin','analytics.read'),
  ('supervisor','notifications.read'),('supervisor','conversations.read'),('supervisor','conversations.create'),('supervisor','support.create'),('supervisor','support.read'),('supervisor','ai.use'),('supervisor','content.read'),('supervisor','analytics.read'),
  ('teacher','notifications.read'),('teacher','conversations.read'),('teacher','conversations.create'),('teacher','support.create'),('teacher','support.read'),('teacher','ai.use'),('teacher','content.read'),('teacher','content.manage'),('teacher','analytics.read'),
  ('student','notifications.read'),('student','conversations.read'),('student','conversations.create'),('student','support.create'),('student','support.read'),('student','ai.use'),('student','content.read'),('student','analytics.read'),
  ('parent','notifications.read'),('parent','conversations.read'),('parent','conversations.create'),('parent','support.create'),('parent','support.read'),('parent','ai.use'),('parent','content.read'),('parent','analytics.read'),
  ('finance','notifications.read'),('finance','support.create'),('finance','support.read'),('finance','analytics.read')
)
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from mapping m join public.roles r on r.key=m.role_key join public.permissions p on p.key=m.permission_key
on conflict do nothing;

-- Explicit grants for Phase 3 objects and safe defaults for later migrations.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to myschool_runtime;
grant usage, select on all sequences in schema public to myschool_runtime;
alter default privileges in schema public grant select, insert, update, delete on tables to myschool_runtime;
alter default privileges in schema public grant usage, select on sequences to myschool_runtime;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant execute on function app.current_user_id() to myschool_runtime;
grant execute on function app.current_tenant_id() to myschool_runtime;
grant execute on function app.current_school_id() to myschool_runtime;
grant execute on function app.has_permission(text, uuid, uuid, uuid) to myschool_runtime;
grant execute on function app.can_access_tenant(uuid) to myschool_runtime;
grant execute on function app.can_access_school(uuid, uuid) to myschool_runtime;
grant usage on schema app to authenticated;
grant select on app.user_effective_permissions to authenticated;
grant select on app.user_membership_scopes to authenticated;
grant execute on function app.has_permission(text, uuid, uuid, uuid) to authenticated;

create or replace function app.can_access_notification(p_notification_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public,app as $$
  select exists(
    select 1 from public.notifications n
    where n.id=p_notification_id and n.tenant_id=p_tenant_id and (
      n.recipient_user_id = auth.uid() or
      (n.class_id is not null and app.can_access_class(n.class_id, p_tenant_id, p_school_id)) or
      (n.class_id is null and (n.school_id is null or app.can_access_school(p_tenant_id, p_school_id))) or
      app.has_permission('notifications.manage', p_tenant_id, p_school_id, null)
    )
  );
$$;

create or replace function app.can_access_conversation(p_conversation_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public,app as $$
  select exists(
    select 1 from public.conversations c
    left join public.conversation_participants cp on cp.conversation_id=c.id and cp.user_id=auth.uid()
    where c.id=p_conversation_id and c.tenant_id=p_tenant_id and (
      cp.user_id is not null or
      (c.class_id is not null and app.can_access_class(c.class_id, p_tenant_id, p_school_id)) or
      (c.school_id is null and c.created_by = auth.uid()) or
      app.has_permission('conversations.manage', p_tenant_id, p_school_id, c.class_id)
    )
  );
$$;

create or replace function app.can_access_ticket(p_ticket_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public,app as $$
  select exists(
    select 1 from public.support_tickets t
    where t.id=p_ticket_id and t.tenant_id=p_tenant_id and (
      t.created_by = auth.uid() or t.created_for_user_id = auth.uid() or t.assigned_to_user_id = auth.uid() or
      app.has_permission('support.read', p_tenant_id, p_school_id, null) or
      app.has_permission('support.manage', p_tenant_id, p_school_id, null)
    )
  );
$$;

create or replace function app.can_access_content_item(p_item_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public,app as $$
  select exists(
    select 1 from public.content_items c
    where c.id=p_item_id and c.tenant_id=p_tenant_id and (
      c.status='published' and (c.class_id is null or app.can_access_class(c.class_id, p_tenant_id, p_school_id)) or
      app.has_permission('content.manage', p_tenant_id, p_school_id, c.class_id)
    )
  );
$$;

create or replace function app.can_access_ai_request(p_request_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public,app as $$
  select exists(
    select 1 from public.ai_requests r
    where r.id=p_request_id and r.tenant_id=p_tenant_id and (
      r.requester_user_id = auth.uid() or
      app.has_permission('ai.read', p_tenant_id, p_school_id, null) or
      app.has_permission('ai.manage', p_tenant_id, p_school_id, null)
    )
  );
$$;

grant execute on function app.can_access_notification(uuid, uuid, uuid) to authenticated, myschool_runtime;
grant execute on function app.can_access_conversation(uuid, uuid, uuid) to authenticated, myschool_runtime;
grant execute on function app.can_access_ticket(uuid, uuid, uuid) to authenticated, myschool_runtime;
grant execute on function app.can_access_content_item(uuid, uuid, uuid) to authenticated, myschool_runtime;
grant execute on function app.can_access_ai_request(uuid, uuid, uuid) to authenticated, myschool_runtime;

do $$
declare t text;
begin
  foreach t in array array[
    'notifications','notification_preferences','conversations','conversation_participants','messages','message_edits','message_deletions',
    'support_tickets','ticket_messages','ticket_attachments','ticket_slas','ai_provider_routes','prompt_templates','ai_requests','ai_responses','ai_usage','safety_filters','content_items','content_versions','analytics_snapshots','early_warning_flags'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy notifications_read on public.notifications for select to myschool_runtime
  using (recipient_user_id = auth.uid() or (school_id is not null and app.can_access_school(tenant_id, school_id)) or app.has_permission('notifications.manage', tenant_id, school_id, class_id));
create policy notifications_write on public.notifications for all to myschool_runtime
  using (app.has_permission('notifications.manage', tenant_id, school_id, class_id))
  with check (app.has_permission('notifications.manage', tenant_id, school_id, class_id));

create policy notification_preferences_self on public.notification_preferences for all to myschool_runtime
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy conversations_read on public.conversations for select to myschool_runtime
  using (app.can_access_conversation(id, tenant_id, school_id));
create policy conversations_write on public.conversations for all to myschool_runtime
  using (app.has_permission('conversations.manage', tenant_id, school_id, class_id) or created_by = auth.uid())
  with check (app.has_permission('conversations.manage', tenant_id, school_id, class_id) or created_by = auth.uid());

create policy conversation_participants_read on public.conversation_participants for select to myschool_runtime
  using (exists(select 1 from public.conversations c where c.id=conversation_id and app.can_access_conversation(c.id, c.tenant_id, c.school_id)));
create policy conversation_participants_write on public.conversation_participants for all to myschool_runtime
  using (app.has_permission('conversations.manage', tenant_id, school_id, null) or user_id = auth.uid())
  with check (app.has_permission('conversations.manage', tenant_id, school_id, null) or user_id = auth.uid());

create policy messages_read on public.messages for select to myschool_runtime
  using (app.can_access_conversation(conversation_id, tenant_id, school_id));
create policy messages_write on public.messages for all to myschool_runtime
  using (app.can_access_conversation(conversation_id, tenant_id, school_id) or sender_user_id = auth.uid())
  with check (app.can_access_conversation(conversation_id, tenant_id, school_id) or sender_user_id = auth.uid());

create policy message_edits_read on public.message_edits for select to myschool_runtime
  using (exists(select 1 from public.messages m where m.id=message_id and app.can_access_conversation(m.conversation_id, m.tenant_id, m.school_id)));
create policy message_edits_write on public.message_edits for all to myschool_runtime
  using (edited_by = auth.uid() or app.has_permission('conversations.manage', null, null, null))
  with check (edited_by = auth.uid() or app.has_permission('conversations.manage', null, null, null));

create policy message_deletions_read on public.message_deletions for select to myschool_runtime
  using (exists(select 1 from public.messages m where m.id=message_id and app.can_access_conversation(m.conversation_id, m.tenant_id, m.school_id)));
create policy message_deletions_write on public.message_deletions for all to myschool_runtime
  using (deleted_by = auth.uid() or app.has_permission('conversations.manage', null, null, null))
  with check (deleted_by = auth.uid() or app.has_permission('conversations.manage', null, null, null));

create policy support_tickets_read on public.support_tickets for select to myschool_runtime
  using (app.can_access_ticket(id, tenant_id, school_id));
create policy support_tickets_write on public.support_tickets for all to myschool_runtime
  using (created_by = auth.uid() or app.has_permission('support.manage', tenant_id, school_id, null) or app.has_permission('support.create', tenant_id, school_id, null))
  with check (created_by = auth.uid() or app.has_permission('support.manage', tenant_id, school_id, null) or app.has_permission('support.create', tenant_id, school_id, null));

create policy ticket_messages_read on public.ticket_messages for select to myschool_runtime
  using (exists(select 1 from public.support_tickets t where t.id=ticket_id and app.can_access_ticket(t.id, t.tenant_id, t.school_id)));
create policy ticket_messages_write on public.ticket_messages for all to myschool_runtime
  using (sender_user_id = auth.uid() or exists(select 1 from public.support_tickets t where t.id=ticket_id and app.can_access_ticket(t.id, t.tenant_id, t.school_id)))
  with check (sender_user_id = auth.uid() or exists(select 1 from public.support_tickets t where t.id=ticket_id and app.can_access_ticket(t.id, t.tenant_id, t.school_id)));

create policy ticket_attachments_read on public.ticket_attachments for select to myschool_runtime
  using (exists(select 1 from public.ticket_messages m where m.id=ticket_message_id and exists(select 1 from public.support_tickets t where t.id=m.ticket_id and app.can_access_ticket(t.id, t.tenant_id, t.school_id))));
create policy ticket_attachments_write on public.ticket_attachments for all to myschool_runtime
  using (app.has_permission('support.manage', tenant_id, school_id, null) or exists(select 1 from public.ticket_messages m where m.id=ticket_message_id and m.sender_user_id = auth.uid()))
  with check (app.has_permission('support.manage', tenant_id, school_id, null) or exists(select 1 from public.ticket_messages m where m.id=ticket_message_id and m.sender_user_id = auth.uid()));

create policy ticket_slas_read on public.ticket_slas for select to myschool_runtime
  using (exists(select 1 from public.support_tickets t where t.id=ticket_id and app.can_access_ticket(t.id, t.tenant_id, t.school_id)));
create policy ticket_slas_write on public.ticket_slas for all to myschool_runtime
  using (app.has_permission('support.manage', null, null, null))
  with check (app.has_permission('support.manage', null, null, null));

create policy ai_provider_routes_read on public.ai_provider_routes for select to myschool_runtime
  using (app.has_permission('ai.read', tenant_id, school_id, null) or app.has_permission('ai.manage', tenant_id, school_id, null));
create policy ai_provider_routes_write on public.ai_provider_routes for all to myschool_runtime
  using (app.has_permission('ai.manage', tenant_id, school_id, null))
  with check (app.has_permission('ai.manage', tenant_id, school_id, null));

create policy prompt_templates_read on public.prompt_templates for select to myschool_runtime
  using (app.has_permission('ai.read', tenant_id, school_id, null) or app.has_permission('ai.manage', tenant_id, school_id, null));
create policy prompt_templates_write on public.prompt_templates for all to myschool_runtime
  using (app.has_permission('ai.manage', tenant_id, school_id, null))
  with check (app.has_permission('ai.manage', tenant_id, school_id, null));

create policy ai_requests_read on public.ai_requests for select to myschool_runtime
  using (app.can_access_ai_request(id, tenant_id, school_id));
create policy ai_requests_write on public.ai_requests for insert to myschool_runtime
  with check (app.has_permission('ai.use', tenant_id, school_id, null) and requester_user_id = auth.uid());
create policy ai_requests_update on public.ai_requests for update to myschool_runtime
  using (app.can_access_ai_request(id, tenant_id, school_id))
  with check (app.can_access_ai_request(id, tenant_id, school_id));

create policy ai_responses_read on public.ai_responses for select to myschool_runtime
  using (exists(select 1 from public.ai_requests r where r.id=request_id and app.can_access_ai_request(r.id, r.tenant_id, r.school_id)));
create policy ai_responses_write on public.ai_responses for all to myschool_runtime
  using (app.has_permission('ai.manage', tenant_id, school_id, null) or exists(select 1 from public.ai_requests r where r.id=request_id and r.requester_user_id = auth.uid()))
  with check (app.has_permission('ai.manage', tenant_id, school_id, null) or exists(select 1 from public.ai_requests r where r.id=request_id and r.requester_user_id = auth.uid()));

create policy ai_usage_read on public.ai_usage for select to myschool_runtime
  using (app.has_permission('ai.read', tenant_id, school_id, null) or user_id = auth.uid());
create policy ai_usage_write on public.ai_usage for all to myschool_runtime
  using (app.has_permission('ai.use', tenant_id, school_id, null) or user_id = auth.uid())
  with check (app.has_permission('ai.use', tenant_id, school_id, null) or user_id = auth.uid());

create policy safety_filters_read on public.safety_filters for select to myschool_runtime
  using (app.has_permission('ai.read', tenant_id, school_id, null) or app.has_permission('ai.manage', tenant_id, school_id, null));
create policy safety_filters_write on public.safety_filters for all to myschool_runtime
  using (app.has_permission('ai.manage', tenant_id, school_id, null))
  with check (app.has_permission('ai.manage', tenant_id, school_id, null));

create policy content_items_read on public.content_items for select to myschool_runtime
  using (
    status = 'published' and (
      app.can_access_school(tenant_id, school_id) or
      (class_id is not null and app.can_access_class(class_id, tenant_id, school_id))
    ) or app.has_permission('content.manage', tenant_id, school_id, class_id)
  );
create policy content_items_write on public.content_items for all to myschool_runtime
  using (app.has_permission('content.manage', tenant_id, school_id, class_id))
  with check (app.has_permission('content.manage', tenant_id, school_id, class_id));

create policy content_versions_read on public.content_versions for select to myschool_runtime
  using (exists(select 1 from public.content_items c where c.id=content_item_id and app.can_access_content_item(c.id, c.tenant_id, c.school_id)));
create policy content_versions_write on public.content_versions for all to myschool_runtime
  using (app.has_permission('content.manage', tenant_id, school_id, null))
  with check (app.has_permission('content.manage', tenant_id, school_id, null));

create policy analytics_snapshots_read on public.analytics_snapshots for select to myschool_runtime
  using (app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('analytics.read', tenant_id, school_id, null));
create policy analytics_snapshots_write on public.analytics_snapshots for all to myschool_runtime
  using (app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('analytics.read', tenant_id, school_id, null))
  with check (app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('analytics.read', tenant_id, school_id, null));

create policy early_warning_flags_read on public.early_warning_flags for select to myschool_runtime
  using (app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('analytics.read', tenant_id, school_id, null));
create policy early_warning_flags_write on public.early_warning_flags for all to myschool_runtime
  using (app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('analytics.read', tenant_id, school_id, null))
  with check (app.has_permission('reports.read', tenant_id, school_id, null) or app.has_permission('analytics.read', tenant_id, school_id, null));

revoke all on all tables in schema public from anon, authenticated;
commit;