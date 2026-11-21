begin;

alter type public.ai_feature_key add value if not exists 'parent_assistant';

create table if not exists public.ai_experience_feedback (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ai_requests(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check (rating in ('helpful','not_helpful')),
  comment text,
  created_at timestamptz not null default now(),
  unique (request_id,user_id),
  foreign key (school_id,tenant_id) references public.schools(id,tenant_id) on delete cascade,
  check (comment is null or length(comment) <= 1000)
);

create index if not exists ai_experience_feedback_scope_idx
  on public.ai_experience_feedback(tenant_id,school_id,created_at desc);

alter table public.ai_experience_feedback enable row level security;
grant select,insert,update on public.ai_experience_feedback to myschool_runtime;

create policy ai_experience_feedback_read_own
  on public.ai_experience_feedback for select to myschool_runtime
  using (user_id=auth.uid());

create policy ai_experience_feedback_insert_own_completed_request
  on public.ai_experience_feedback for insert to myschool_runtime
  with check (
    user_id=auth.uid()
    and exists (
      select 1 from public.ai_requests r
      where r.id=request_id
        and r.tenant_id=ai_experience_feedback.tenant_id
        and r.school_id is not distinct from ai_experience_feedback.school_id
        and r.requester_user_id=auth.uid()
        and r.status='completed'
        and r.safety_status='approved'
    )
  );

create policy ai_experience_feedback_update_own_completed_request
  on public.ai_experience_feedback for update to myschool_runtime
  using (user_id=auth.uid())
  with check (
    user_id=auth.uid()
    and exists (
      select 1 from public.ai_requests r
      where r.id=request_id
        and r.tenant_id=ai_experience_feedback.tenant_id
        and r.school_id is not distinct from ai_experience_feedback.school_id
        and r.requester_user_id=auth.uid()
        and r.status='completed'
        and r.safety_status='approved'
    )
  );

revoke all on public.ai_experience_feedback from anon,authenticated;

commit;