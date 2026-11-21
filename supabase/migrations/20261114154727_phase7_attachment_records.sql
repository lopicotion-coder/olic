begin;
alter table public.notification_deliveries add column if not exists locked_at timestamptz,
 add column if not exists locked_by text, add column if not exists last_attempt_at timestamptz;
update public.notification_deliveries set status='pending',locked_at=null,locked_by=null,
 last_error=coalesce(last_error,'Recovered legacy processing row without a lease'),updated_at=now()
where status='processing' and locked_at is null;
alter table public.notification_deliveries add constraint notification_deliveries_processing_lease_check
 check ((status='processing')=(locked_at is not null));
create index if not exists notification_deliveries_processing_lease_idx on public.notification_deliveries(locked_at) where status='processing';

alter table public.ticket_attachments add column if not exists document_id uuid references public.documents(id) on delete set null;
create unique index if not exists ticket_attachments_message_document_uidx
 on public.ticket_attachments(ticket_message_id,document_id) where document_id is not null;
create table public.message_attachments (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade,
 tenant_id uuid not null, school_id uuid not null, document_id uuid not null references public.documents(id) on delete restrict,
 attached_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 foreign key(school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
 unique(message_id,document_id)
);
create index message_attachments_message_idx on public.message_attachments(message_id,created_at);
alter table public.message_attachments enable row level security;
create policy message_attachments_read on public.message_attachments for select to myschool_runtime
 using (tenant_id=app.current_tenant_id() and exists(
   select 1 from public.messages m where m.id=message_id and m.tenant_id=message_attachments.tenant_id
    and m.school_id is not distinct from message_attachments.school_id
    and app.can_access_conversation(m.conversation_id,m.tenant_id,m.school_id)
 ));
create policy message_attachments_insert on public.message_attachments for insert to myschool_runtime
 with check (tenant_id=app.current_tenant_id() and attached_by=(select auth.uid()) and exists(
   select 1 from public.messages m join public.documents d on d.id=document_id
   where m.id=message_id and m.tenant_id=message_attachments.tenant_id
    and m.school_id is not distinct from message_attachments.school_id
    and d.tenant_id=m.tenant_id and d.school_id is not distinct from m.school_id
    and d.uploaded_by=(select auth.uid()) and d.resource_type='message' and d.resource_id=m.conversation_id
    and app.can_access_conversation(m.conversation_id,m.tenant_id,m.school_id)
 ));
grant select,insert,update,delete on public.message_attachments to myschool_runtime;

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to myschool_runtime
 using ((resource_type is null or resource_type not in ('message','support_ticket')) and (
  app.has_permission('files.read',tenant_id,school_id,class_id)
  or (student_id is not null and (
    app.is_student_owner(student_id) or app.is_guardian_of_student(student_id)
    or app.has_permission('students.read',tenant_id,school_id,class_id)
  ))
 ));
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to myschool_runtime
 with check ((resource_type is null or resource_type not in ('message','support_ticket'))
  and uploaded_by=(select auth.uid())
  and (app.has_permission('files.upload',tenant_id,school_id,class_id)
    or (student_id is not null and app.is_student_owner(student_id)
      and app.has_permission('assignments.submit',tenant_id,school_id,class_id))
 ));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to myschool_runtime
 using ((resource_type is null or resource_type not in ('message','support_ticket'))
  and app.has_permission('files.upload',tenant_id,school_id,class_id));

create policy documents_comm_attachment_read on public.documents for select to myschool_runtime
 using (
  (resource_type='message' and exists(
    select 1 from public.conversations c where c.id=documents.resource_id and c.tenant_id=documents.tenant_id
     and c.school_id is not distinct from documents.school_id and c.class_id is not distinct from documents.class_id
     and app.can_access_conversation(c.id,c.tenant_id,c.school_id)
  ))
  or (resource_type='support_ticket' and exists(
    select 1 from public.support_tickets t where t.id=documents.resource_id and t.tenant_id=documents.tenant_id
     and t.school_id is not distinct from documents.school_id and app.can_access_ticket(t.id,t.tenant_id,t.school_id)
  ))
 );
create policy documents_comm_attachment_insert on public.documents for insert to myschool_runtime
 with check (uploaded_by=(select auth.uid()) and (
  (resource_type='message' and exists(
    select 1 from public.conversations c where c.id=resource_id and c.tenant_id=documents.tenant_id
     and c.school_id is not distinct from documents.school_id and c.class_id is not distinct from documents.class_id
     and app.can_access_conversation(c.id,c.tenant_id,c.school_id)
  ))
  or (resource_type='support_ticket' and exists(
    select 1 from public.support_tickets t where t.id=resource_id and t.tenant_id=documents.tenant_id
     and t.school_id is not distinct from documents.school_id and app.can_access_ticket(t.id,t.tenant_id,t.school_id)
  ))
 ));
commit;