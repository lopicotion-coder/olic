
create or replace function app.guard_question_bank_source_scope_update()
returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  if new.sharing_scope is distinct from old.sharing_scope
     or new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.origin_type is distinct from old.origin_type then

    if exists (
      select 1
        from public.question_sources qs
        join public.curriculum_chunks cc on cc.id = qs.chunk_id
        join public.curriculum_sources cs on cs.id = cc.source_id
       where qs.question_id = new.id
         and (
           cs.status <> 'active'
           or cs.rights_status <> 'approved'
           or (
             new.origin_type = 'ai_generated'
             and not ('question_generation' = any(cs.permitted_uses))
           )
           or not (
             (
               new.sharing_scope = 'platform'
               and cs.sharing_scope = 'platform'
               and 'question_reuse_platform' = any(cs.permitted_uses)
             )
             or (
               new.sharing_scope = 'tenant'
               and (
                 (
                   cs.sharing_scope = 'platform'
                   and 'question_reuse_platform' = any(cs.permitted_uses)
                 )
                 or (
                   cs.sharing_scope = 'tenant'
                   and cs.tenant_id = new.tenant_id
                   and (
                     'question_reuse_tenant' = any(cs.permitted_uses)
                     or 'question_reuse_platform' = any(cs.permitted_uses)
                   )
                 )
               )
             )
             or (
               new.sharing_scope = 'school'
               and (
                 (
                   cs.sharing_scope = 'platform'
                   and 'question_reuse_platform' = any(cs.permitted_uses)
                 )
                 or (
                   cs.sharing_scope = 'tenant'
                   and cs.tenant_id = new.tenant_id
                   and (
                     'question_reuse_tenant' = any(cs.permitted_uses)
                     or 'question_reuse_platform' = any(cs.permitted_uses)
                   )
                 )
                 or (
                   cs.sharing_scope = 'school'
                   and cs.tenant_id = new.tenant_id
                   and cs.school_id = new.school_id
                   and (
                     'question_reuse_school' = any(cs.permitted_uses)
                     or 'question_reuse_tenant' = any(cs.permitted_uses)
                     or 'question_reuse_platform' = any(cs.permitted_uses)
                   )
                 )
               )
             )
           )
         )
    ) then
      raise exception 'Question cannot be moved to a scope not permitted by its linked curriculum sources';
    end if;
  end if;

  return new;
end;
$$;

create trigger question_bank_guard_source_scope_update
before update on public.question_bank
for each row
execute function app.guard_question_bank_source_scope_update();

create or replace function app.block_question_if_last_grounding_removed()
returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  update public.question_bank q
     set review_status = 'needs_review',
         record_status = 'blocked',
         updated_at = now()
   where q.id = old.question_id
     and q.origin_type = 'ai_generated'
     and q.review_status = 'approved'
     and not exists (
       select 1
         from public.question_sources qs
         join public.curriculum_chunks cc on cc.id = qs.chunk_id
         join public.curriculum_sources cs on cs.id = cc.source_id
        where qs.question_id = old.question_id
          and cs.status = 'active'
          and cs.rights_status = 'approved'
          and 'question_generation' = any(cs.permitted_uses)
     );

  return old;
end;
$$;

create trigger question_sources_keep_ai_grounding
after delete on public.question_sources
for each row
execute function app.block_question_if_last_grounding_removed();

-- Event history is immutable to application and worker roles after insertion.
revoke update, delete, truncate
on public.question_exposure_events
from service_role, authenticated, anon, public, myschool_runtime;

comment on function app.guard_question_bank_source_scope_update() is
  'Prevents a question from being re-scoped beyond the permissions of its cited curriculum sources.';
comment on function app.block_question_if_last_grounding_removed() is
  'Blocks an approved AI-generated question if its last approved curriculum grounding is removed.';
