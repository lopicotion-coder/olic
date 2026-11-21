begin;
alter table public.notification_deliveries drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
 check(status in ('pending','processing','sent','delivered','dead_letter','failed','cancelled'));
alter table public.notification_deliveries add column if not exists delivered_at timestamptz;
create index if not exists notification_deliveries_receipt_reconcile_idx
 on public.notification_deliveries(tenant_id,school_id,sent_at)
 where status='sent' and channel='push' and provider_key='expo';

create table public.notification_delivery_dead_letters (
 id uuid primary key default gen_random_uuid(),
 delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
 tenant_id uuid not null, school_id uuid not null,
 attempts integer not null check(attempts>=0), final_error text not null,
 quarantined_at timestamptz not null default now(), replayed_at timestamptz,
 replayed_by uuid references auth.users(id) on delete set null,
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
 unique(delivery_id)
);
create index notification_delivery_dead_letters_scope_idx
 on public.notification_delivery_dead_letters(tenant_id,school_id,quarantined_at desc)
 where replayed_at is null;

create table public.notification_provider_events (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null, school_id uuid not null,
 delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
 provider_key text not null check(provider_key in ('resend','expo')),
 provider_event_id text not null, event_type text not null,
 outcome text not null check(outcome in ('sent','delivered','failed')),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 received_at timestamptz not null default now(),
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
 unique(provider_key,provider_event_id)
);
create index notification_provider_events_delivery_idx
 on public.notification_provider_events(tenant_id,school_id,delivery_id,received_at desc);

insert into public.roles(key,name,scope,is_system)
values('notification_worker','Notification Delivery Worker','tenant',true)
on conflict(key) do update set name=excluded.name,scope=excluded.scope,is_system=true;
delete from public.role_permissions rp using public.roles r
where r.id=rp.role_id and r.key='notification_worker'
 and rp.permission_id not in(select id from public.permissions where key='notifications.manage');
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='notifications.manage'
where r.key='notification_worker' on conflict do nothing;

alter table public.notification_delivery_dead_letters enable row level security;
alter table public.notification_provider_events enable row level security;
create policy notification_delivery_dead_letters_manage on public.notification_delivery_dead_letters for all to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null))
 with check(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));
create policy notification_provider_events_manage on public.notification_provider_events for all to myschool_runtime
 using(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null))
 with check(tenant_id=app.current_tenant_id() and app.has_permission('notifications.manage',tenant_id,school_id,null));

revoke all on public.notification_deliveries,public.notification_delivery_attempts,public.user_push_devices,
 public.notification_receipts,public.message_receipts,public.notification_delivery_dead_letters,
 public.notification_provider_events from anon,authenticated;
grant select,insert,update,delete on public.notification_delivery_dead_letters,public.notification_provider_events to myschool_runtime;
commit;