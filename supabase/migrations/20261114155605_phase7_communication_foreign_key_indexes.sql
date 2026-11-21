begin;
create index if not exists notification_deliveries_notification_fk_idx on public.notification_deliveries(notification_id);
create index if not exists notification_deliveries_recipient_fk_idx on public.notification_deliveries(recipient_user_id);
create index if not exists notification_deliveries_school_tenant_fk_idx on public.notification_deliveries(school_id,tenant_id);
create index if not exists user_push_devices_school_tenant_fk_idx on public.user_push_devices(school_id,tenant_id);

create index if not exists notification_receipts_user_fk_idx on public.notification_receipts(user_id);
create index if not exists notification_receipts_school_tenant_fk_idx on public.notification_receipts(school_id,tenant_id);
create index if not exists message_receipts_user_fk_idx on public.message_receipts(user_id);
create index if not exists message_receipts_school_tenant_fk_idx on public.message_receipts(school_id,tenant_id);

create index if not exists ticket_sla_escalations_school_tenant_fk_idx on public.ticket_sla_escalations(school_id,tenant_id);
create index if not exists ticket_assignment_history_school_tenant_fk_idx on public.ticket_assignment_history(school_id,tenant_id);
create index if not exists ticket_assignment_history_previous_assignee_fk_idx on public.ticket_assignment_history(previous_assignee_user_id);
create index if not exists ticket_assignment_history_new_assignee_fk_idx on public.ticket_assignment_history(new_assignee_user_id);
create index if not exists ticket_assignment_history_changed_by_fk_idx on public.ticket_assignment_history(changed_by);

create index if not exists message_attachments_document_fk_idx on public.message_attachments(document_id);
create index if not exists message_attachments_school_tenant_fk_idx on public.message_attachments(school_id,tenant_id);
create index if not exists notification_delivery_dead_letters_school_tenant_fk_idx on public.notification_delivery_dead_letters(school_id,tenant_id);
create index if not exists notification_provider_events_delivery_fk_idx on public.notification_provider_events(delivery_id);
create index if not exists notification_provider_events_school_tenant_fk_idx on public.notification_provider_events(school_id,tenant_id);
commit;