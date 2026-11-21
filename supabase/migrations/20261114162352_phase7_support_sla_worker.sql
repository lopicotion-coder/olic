begin;

-- Dedicated tenant-scoped SLA worker. It receives no support-manager or notification permissions.
insert into public.permissions(key, description)
values ('support.sla.process', 'Process support ticket SLA deadlines and create escalation records')
on conflict (key) do nothing;

insert into public.roles(key, name, scope, is_system)
values ('support_sla_worker', 'Support SLA Worker', 'tenant', true)
on conflict (key) do nothing;

-- Enforce least privilege if this system role is re-applied or previously modified.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id=r.id
  and rp.permission_id=p.id
  and r.key='support_sla_worker'
  and p.key<>'support.sla.process';

insert into public.role_permissions(role_id, permission_id)
select r.id,p.id
from public.roles r cross join public.permissions p
where r.key='support_sla_worker' and r.scope='tenant' and p.key='support.sla.process'
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from public.roles r
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where r.key='support_sla_worker' and r.scope='tenant'
      and p.key='support.sla.process'
  ) then
    raise exception 'The support_sla_worker role must be tenant-scoped and have support.sla.process.';
  end if;
end $$;

-- Tenant-level support tickets have no school id. Existing school rows remain protected by the composite FK.
alter table public.ticket_sla_escalations alter column school_id drop not null;

-- Preserve read isolation for existing support users, including tenant-level (NULL school) tickets.
drop policy if exists ticket_sla_escalations_read on public.ticket_sla_escalations;
create policy ticket_sla_escalations_read on public.ticket_sla_escalations for select to myschool_runtime
  using (tenant_id=app.current_tenant_id() and exists(
    select 1 from public.support_tickets t
    where t.id=ticket_id and t.tenant_id=ticket_sla_escalations.tenant_id
      and t.school_id is not distinct from ticket_sla_escalations.school_id
      and app.can_access_ticket(t.id,t.tenant_id,t.school_id)
  ));

-- Allow an SLA worker to emit a bounded alert without granting it school-wide access.
create or replace function app.guard_notification_insert() returns trigger
language plpgsql security invoker
set search_path=pg_catalog,app,auth as $$
begin
  if new.sender_user_id is distinct from auth.uid() then
    raise exception 'Notification sender must match the authenticated user';
  end if;
  if new.school_id is null or not app.can_access_tenant(new.tenant_id)
    or (not app.can_access_school(new.tenant_id,new.school_id)
      and not app.has_permission('support.sla.process',new.tenant_id,new.school_id,null)) then
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
revoke all on function app.guard_notification_insert() from public,anon,authenticated;
grant execute on function app.guard_notification_insert() to myschool_runtime;

-- Worker permission can only set ticket_slas.breached_at from NULL to a timestamp.
create or replace function app.guard_ticket_sla_worker_update() returns trigger
language plpgsql security invoker
set search_path=pg_catalog,public,app,auth as $$
declare
  v_tenant_id uuid;
  v_school_id uuid;
begin
  select t.tenant_id,t.school_id into v_tenant_id,v_school_id
  from public.support_tickets t where t.id=old.ticket_id;

  if app.has_permission('support.sla.process',v_tenant_id,v_school_id,null) then
    if new.id is distinct from old.id
      or new.ticket_id is distinct from old.ticket_id
      or new.cycle_number is distinct from old.cycle_number
      or new.response_due_at is distinct from old.response_due_at
      or new.resolution_due_at is distinct from old.resolution_due_at
      or new.first_response_at is distinct from old.first_response_at
      or new.resolved_at is distinct from old.resolved_at
      or new.created_at is distinct from old.created_at then
      raise exception 'SLA worker may only update the breach marker';
    end if;
    if new.breached_at is null
      or (old.breached_at is not null and new.breached_at is distinct from old.breached_at) then
      raise exception 'SLA breach markers may only transition from null to a timestamp';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.guard_ticket_sla_worker_update() from public,anon,authenticated;
grant execute on function app.guard_ticket_sla_worker_update() to myschool_runtime;
drop trigger if exists guard_ticket_sla_worker_update on public.ticket_slas;
create trigger guard_ticket_sla_worker_update before update on public.ticket_slas
  for each row execute function app.guard_ticket_sla_worker_update();

-- A narrowly-scoped SECURITY DEFINER operation avoids granting the worker ticket, message,
-- attachment, or Storage visibility through the general app.can_access_ticket helper.
create or replace function app.process_support_sla(p_tenant_id uuid, p_school_id uuid default null)
returns table(ticket_id uuid, escalation_type text, due_at timestamptz)
language plpgsql
security definer
set search_path=pg_catalog,public,app,auth
set row_security=off
as $$
begin
  if auth.uid() is null then
    raise exception 'Authenticated SLA processor required';
  end if;
  if not app.can_access_tenant(p_tenant_id) then
    raise exception 'Tenant membership required for SLA processing';
  end if;
  if p_school_id is not null
    and not app.can_access_school(p_tenant_id,p_school_id)
    and not app.has_permission('support.sla.process',p_tenant_id,p_school_id,null)
    and not app.has_permission('support.manage',p_tenant_id,p_school_id,null) then
    raise exception 'SLA processing permission required for this school';
  end if;

  return query
  with target as materialized (
    select t.id,t.tenant_id,t.school_id,t.assigned_to_user_id,t.title,s.cycle_number,
           s.response_due_at,s.resolution_due_at,s.first_response_at,
           (s.response_due_at<now() and s.first_response_at is null) as response_overdue,
           (s.resolution_due_at<now() and t.status not in ('resolved','closed')) as resolution_overdue
    from public.ticket_slas s
    join public.support_tickets t on t.id=s.ticket_id
    where t.tenant_id=p_tenant_id
      and (p_school_id is null or t.school_id is not distinct from p_school_id)
      and t.status not in ('resolved','closed')
      and (app.has_permission('support.sla.process',t.tenant_id,t.school_id,null)
        or app.has_permission('support.manage',t.tenant_id,t.school_id,null))
      and ((s.response_due_at<now() and s.first_response_at is null and not exists(
             select 1 from public.ticket_sla_escalations e
             where e.ticket_id=t.id and e.cycle_number=s.cycle_number and e.escalation_type='first_response'))
        or (s.resolution_due_at<now() and not exists(
             select 1 from public.ticket_sla_escalations e
             where e.ticket_id=t.id and e.cycle_number=s.cycle_number and e.escalation_type='resolution')))
    for update of s skip locked
  ), marked as (
    update public.ticket_slas s
      set breached_at=coalesce(s.breached_at,now())
    from target x where s.ticket_id=x.id
    returning s.ticket_id
  ), response_escalations as (
    insert into public.ticket_sla_escalations(ticket_id,tenant_id,school_id,cycle_number,escalation_type,due_at)
    select x.id,x.tenant_id,x.school_id,x.cycle_number,'first_response',x.response_due_at
    from target x where x.response_overdue
    on conflict (ticket_id,cycle_number,escalation_type) do nothing
    returning ticket_id,escalation_type,due_at
  ), resolution_escalations as (
    insert into public.ticket_sla_escalations(ticket_id,tenant_id,school_id,cycle_number,escalation_type,due_at)
    select x.id,x.tenant_id,x.school_id,x.cycle_number,'resolution',x.resolution_due_at
    from target x where x.resolution_overdue
    on conflict (ticket_id,cycle_number,escalation_type) do nothing
    returning ticket_id,escalation_type,due_at
  ), escalations as (
    select * from response_escalations
    union all
    select * from resolution_escalations
  ), notifications_created as (
    insert into public.notifications(tenant_id,school_id,recipient_user_id,sender_user_id,title,body,notification_type,metadata)
    select t.tenant_id,t.school_id,t.assigned_to_user_id,auth.uid(),'Support ticket SLA breached',
           'Ticket '||t.title||' has breached the '||e.escalation_type||' SLA.','alert',
           jsonb_build_object('ticketId',t.id,'escalationType',e.escalation_type,'dueAt',e.due_at)
    from escalations e
    join public.support_tickets t on t.id=e.ticket_id
    where t.assigned_to_user_id is not null
      and t.school_id is not null
      and app.has_permission('support.sla.process',t.tenant_id,t.school_id,null)
      and app.is_active_school_member(t.assigned_to_user_id,t.tenant_id,t.school_id)
    returning id
  )
  select e.ticket_id,e.escalation_type,e.due_at from escalations e order by e.due_at asc;
end;
$$;
revoke all on function app.process_support_sla(uuid,uuid) from public,anon,authenticated;
grant execute on function app.process_support_sla(uuid,uuid) to myschool_runtime;

commit;