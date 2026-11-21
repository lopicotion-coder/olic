begin;
alter table public.support_tickets
  add column if not exists closure_reason text,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_by uuid references auth.users(id) on delete set null;

create table public.notification_deliveries (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 school_id uuid not null, notification_id uuid not null references public.notifications(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 channel text not null check(channel in ('email','push')),
 provider_key text not null check(provider_key in ('resend','expo')),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled')),
 attempts integer not null default 0 check(attempts>=0), next_attempt_at timestamptz not null default now(),
 idempotency_key text not null, payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 provider_message_id text, last_error text, created_at timestamptz not null default now(),
 sent_at timestamptz, updated_at timestamptz not null default now(),
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
 unique(tenant_id,idempotency_key),
 check((channel='email' and provider_key='resend') or (channel='push' and provider_key='expo'))
);
create index notification_deliveries_queue_idx on public.notification_deliveries(status,next_attempt_at,created_at) where status in ('pending','failed');
create index notification_deliveries_recipient_idx on public.notification_deliveries(tenant_id,school_id,recipient_user_id,created_at desc);

create table public.notification_delivery_attempts (
 id uuid primary key default gen_random_uuid(), delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
 attempt_number integer not null check(attempt_number>0), provider_key text not null check(provider_key in ('resend','expo')),
 status text not null check(status in ('sent','failed')), http_status integer check(http_status is null or http_status between 100 and 599),
 provider_message_id text, error_message text, attempted_at timestamptz not null default now(),
 unique(delivery_id,attempt_number)
);

create table public.user_push_devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 tenant_id uuid not null references public.tenants(id) on delete cascade, school_id uuid not null,
 platform text not null check(platform in ('android','ios','web')),
 provider_key text not null default 'expo' check(provider_key='expo'), push_token text not null,
 device_label text, is_active boolean not null default true, last_seen_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
 unique(user_id,provider_key,push_token)
);
create index user_push_devices_scope_idx on public.user_push_devices(tenant_id,school_id,user_id) where is_active;

create table public.notification_receipts (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references public.notifications(id) on delete cascade,
 tenant_id uuid not null, school_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 delivered_at timestamptz not null default now(), read_at timestamptz,
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
 unique(notification_id,user_id)
);
create index notification_receipts_user_idx on public.notification_receipts(tenant_id,school_id,user_id,read_at);

create table public.message_receipts (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 tenant_id uuid not null, school_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 delivered_at timestamptz not null default now(), read_at timestamptz,
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
 unique(message_id,user_id)
);
create index message_receipts_conversation_user_idx on public.message_receipts(conversation_id,user_id,read_at);

create table public.ticket_sla_policies (
 priority public.ticket_priority primary key, first_response_minutes integer not null check(first_response_minutes between 1 and 43200),
 resolution_minutes integer not null check(resolution_minutes between 1 and 129600), updated_at timestamptz not null default now()
);
insert into public.ticket_sla_policies(priority,first_response_minutes,resolution_minutes) values
 ('low',1440,10080),('normal',480,2880),('high',120,1440),('urgent',30,240) on conflict(priority) do nothing;
alter table public.ticket_slas add column if not exists cycle_number integer not null default 1 check(cycle_number>0);

create table public.ticket_sla_escalations (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 tenant_id uuid not null, school_id uuid not null, cycle_number integer not null default 1 check(cycle_number>0),
 escalation_type text not null check(escalation_type in ('first_response','resolution')), due_at timestamptz not null,
 created_at timestamptz not null default now(),
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
 unique(ticket_id,cycle_number,escalation_type)
);
create index ticket_sla_escalations_scope_idx on public.ticket_sla_escalations(tenant_id,school_id,due_at);

create table public.ticket_assignment_history (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 tenant_id uuid not null, school_id uuid not null, previous_assignee_user_id uuid references auth.users(id) on delete set null,
 new_assignee_user_id uuid references auth.users(id) on delete set null, changed_by uuid not null references auth.users(id) on delete restrict,
 note text, created_at timestamptz not null default now(),
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade
);
create index ticket_assignment_history_ticket_idx on public.ticket_assignment_history(ticket_id,created_at desc);

drop policy if exists ticket_slas_write on public.ticket_slas;
create policy ticket_slas_creator_insert on public.ticket_slas for insert to myschool_runtime
 with check(exists(select 1 from public.support_tickets t where t.id=ticket_id and t.created_by=(select auth.uid())
   and app.can_access_ticket(t.id,t.tenant_id,t.school_id)));
create policy ticket_slas_manager_update on public.ticket_slas for update to myschool_runtime
 using(exists(select 1 from public.support_tickets t where t.id=ticket_id and app.has_permission('support.manage',t.tenant_id,t.school_id,null)))
 with check(exists(select 1 from public.support_tickets t where t.id=ticket_id and app.has_permission('support.manage',t.tenant_id,t.school_id,null)));
create policy ticket_slas_requester_cycle_update on public.ticket_slas for update to myschool_runtime
 using(exists(select 1 from public.support_tickets t where t.id=ticket_id and t.created_by=(select auth.uid()) and t.status='open'))
 with check(exists(select 1 from public.support_tickets t where t.id=ticket_id and t.created_by=(select auth.uid()) and t.status='open'));

drop policy if exists notifications_read_phase6 on public.notifications;
create policy notifications_read_phase7 on public.notifications for select to myschool_runtime
 using(app.can_access_notification(id,tenant_id,school_id));
create policy notifications_support_escalation_insert on public.notifications for insert to myschool_runtime
 with check(sender_user_id=(select auth.uid()) and app.has_permission('support.manage',tenant_id,school_id,null)
   and app.can_access_school(tenant_id,school_id));

alter table public.notification_deliveries enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.user_push_devices enable row level security;
alter table public.notification_receipts enable row level security;
alter table public.message_receipts enable row level security;
alter table public.ticket_sla_policies enable row level security;
alter table public.ticket_sla_escalations enable row level security;
alter table public.ticket_assignment_history enable row level security;

create policy notification_deliveries_manage on public.notification_deliveries for all to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null))
 with check(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));
create policy notification_delivery_attempts_manage on public.notification_delivery_attempts for all to myschool_runtime
 using(exists(select 1 from public.notification_deliveries d where d.id=delivery_id and d.tenant_id=app.current_tenant_id()
   and app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)))
 with check(exists(select 1 from public.notification_deliveries d where d.id=delivery_id and d.tenant_id=app.current_tenant_id()
   and app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)));
create policy user_push_devices_self on public.user_push_devices for all to myschool_runtime
 using(tenant_id=app.current_tenant_id() and user_id=(select auth.uid()) and app.can_access_school(tenant_id,school_id))
 with check(tenant_id=app.current_tenant_id() and user_id=(select auth.uid()) and app.can_access_school(tenant_id,school_id));
create policy notification_receipts_read on public.notification_receipts for select to myschool_runtime
 using(tenant_id=app.current_tenant_id() and (user_id=(select auth.uid()) or app.has_permission('notifications.manage',tenant_id,school_id,null)));
create policy notification_receipts_insert on public.notification_receipts for insert to myschool_runtime
 with check(user_id=(select auth.uid()) and app.can_access_notification(notification_id,tenant_id,school_id));
create policy notification_receipts_update on public.notification_receipts for update to myschool_runtime
 using(user_id=(select auth.uid()) and tenant_id=app.current_tenant_id())
 with check(user_id=(select auth.uid()) and tenant_id=app.current_tenant_id());
create policy message_receipts_read on public.message_receipts for select to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.can_access_conversation(conversation_id,tenant_id,school_id));
create policy message_receipts_insert_self on public.message_receipts for insert to myschool_runtime
 with check(user_id=(select auth.uid()) and app.can_access_conversation(conversation_id,tenant_id,school_id));
create policy message_receipts_sender_delivery_insert on public.message_receipts for insert to myschool_runtime
 with check(exists(select 1 from public.messages m join public.conversation_participants cp
   on cp.conversation_id=m.conversation_id and cp.user_id=message_receipts.user_id
   where m.id=message_receipts.message_id and m.conversation_id=message_receipts.conversation_id
     and m.tenant_id=message_receipts.tenant_id and m.school_id is not distinct from message_receipts.school_id
     and m.sender_user_id=(select auth.uid()) and app.can_access_conversation(m.conversation_id,m.tenant_id,m.school_id)));
create policy message_receipts_update_self on public.message_receipts for update to myschool_runtime
 using(user_id=(select auth.uid()) and tenant_id=app.current_tenant_id() and app.can_access_conversation(conversation_id,tenant_id,school_id))
 with check(user_id=(select auth.uid()) and tenant_id=app.current_tenant_id() and app.can_access_conversation(conversation_id,tenant_id,school_id));
create policy ticket_sla_policies_read on public.ticket_sla_policies for select to myschool_runtime using(true);
create policy ticket_sla_policies_manage on public.ticket_sla_policies for all to myschool_runtime
 using(app.has_permission('support.manage',app.current_tenant_id(),app.current_school_id(),null))
 with check(app.has_permission('support.manage',app.current_tenant_id(),app.current_school_id(),null));
create policy ticket_sla_escalations_read on public.ticket_sla_escalations for select to myschool_runtime
 using(tenant_id=app.current_tenant_id() and exists(select 1 from public.support_tickets t where t.id=ticket_id
   and t.tenant_id=ticket_sla_escalations.tenant_id and t.school_id=ticket_sla_escalations.school_id
   and app.can_access_ticket(t.id,t.tenant_id,t.school_id)));
create policy ticket_sla_escalations_manage on public.ticket_sla_escalations for all to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('support.manage',tenant_id,school_id,null))
 with check(tenant_id=app.current_tenant_id() and app.has_permission('support.manage',tenant_id,school_id,null));
create policy ticket_assignment_history_read on public.ticket_assignment_history for select to myschool_runtime
 using(tenant_id=app.current_tenant_id() and exists(select 1 from public.support_tickets t where t.id=ticket_id
   and t.tenant_id=ticket_assignment_history.tenant_id and t.school_id=ticket_assignment_history.school_id
   and app.can_access_ticket(t.id,t.tenant_id,t.school_id)));
create policy ticket_assignment_history_insert on public.ticket_assignment_history for insert to myschool_runtime
 with check(tenant_id=app.current_tenant_id() and changed_by=(select auth.uid())
   and app.has_permission('support.manage',tenant_id,school_id,null));

create or replace function app.guard_notification_receipt_update() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
 if old.user_id is distinct from auth.uid() then raise exception 'Only the receipt owner may update it'; end if;
 if new.id is distinct from old.id or new.notification_id is distinct from old.notification_id
   or new.tenant_id is distinct from old.tenant_id or new.school_id is distinct from old.school_id
   or new.user_id is distinct from old.user_id or new.delivered_at is distinct from old.delivered_at then
   raise exception 'Receipt ownership and delivery timestamp are immutable';
 end if;
 if old.read_at is not null and new.read_at is distinct from old.read_at then raise exception 'Read receipt cannot be cleared'; end if;
 return new;
end $$;
create trigger guard_notification_receipt_update before update on public.notification_receipts
 for each row execute function app.guard_notification_receipt_update();

create or replace function app.guard_message_receipt_update() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
 if old.user_id is distinct from auth.uid() then raise exception 'Only the receipt owner may update it'; end if;
 if new.id is distinct from old.id or new.message_id is distinct from old.message_id
   or new.conversation_id is distinct from old.conversation_id or new.tenant_id is distinct from old.tenant_id
   or new.school_id is distinct from old.school_id or new.user_id is distinct from old.user_id
   or new.delivered_at is distinct from old.delivered_at then
   raise exception 'Receipt ownership and delivery timestamp are immutable';
 end if;
 if old.read_at is not null and new.read_at is distinct from old.read_at then raise exception 'Read receipt cannot be cleared'; end if;
 return new;
end $$;
create trigger guard_message_receipt_update before update on public.message_receipts
 for each row execute function app.guard_message_receipt_update();

create or replace function app.guard_push_device_write() returns trigger
language plpgsql set search_path=pg_catalog,app,auth as $$
begin
 if new.user_id is distinct from auth.uid() then raise exception 'Push devices must belong to the authenticated user'; end if;
 if not app.is_active_school_member(new.user_id,new.tenant_id,new.school_id) then
   raise exception 'Push device must belong to an active school membership';
 end if;
 if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.tenant_id is distinct from old.tenant_id
   or new.school_id is distinct from old.school_id or new.push_token is distinct from old.push_token
   or new.provider_key is distinct from old.provider_key) then
   raise exception 'Push device ownership and token are immutable';
 end if;
 new.updated_at:=now(); return new;
end $$;
create trigger guard_push_device_write before insert or update on public.user_push_devices
 for each row execute function app.guard_push_device_write();

create policy profiles_notification_delivery_read on public.profiles for select to myschool_runtime
 using(exists(select 1 from public.notification_deliveries d where d.recipient_user_id=profiles.id
   and d.tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',d.tenant_id,d.school_id,null)));

revoke all on public.notification_deliveries,public.notification_delivery_attempts,public.user_push_devices,
 public.notification_receipts,public.message_receipts,public.ticket_sla_policies,
 public.ticket_sla_escalations,public.ticket_assignment_history from anon,authenticated;
grant select,insert,update,delete on public.notification_deliveries,public.notification_delivery_attempts,
 public.user_push_devices,public.notification_receipts,public.message_receipts,public.ticket_sla_policies,
 public.ticket_sla_escalations,public.ticket_assignment_history to myschool_runtime;
revoke all on function app.guard_notification_receipt_update() from public,anon,authenticated;
revoke all on function app.guard_message_receipt_update() from public,anon,authenticated;
revoke all on function app.guard_push_device_write() from public,anon,authenticated;
grant execute on function app.guard_notification_receipt_update() to myschool_runtime;
grant execute on function app.guard_message_receipt_update() to myschool_runtime;
grant execute on function app.guard_push_device_write() to myschool_runtime;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
   begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
   begin alter publication supabase_realtime add table public.support_tickets; exception when duplicate_object then null; end;
   begin alter publication supabase_realtime add table public.message_receipts; exception when duplicate_object then null; end;
   begin alter publication supabase_realtime add table public.notification_receipts; exception when duplicate_object then null; end;
 end if;
end $$;
commit;