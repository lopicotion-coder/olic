-- Phase 2: permission-scoped hybrid curriculum retrieval and deterministic lexical indexing.
-- This is additive and leaves existing curriculum source rows/rights untouched.

begin;

create or replace function app.refresh_curriculum_chunk_search_vector()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.search_vector := to_tsvector('simple'::regconfig, coalesce(new.content_text, ''));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists curriculum_chunks_refresh_search_vector on public.curriculum_chunks;
create trigger curriculum_chunks_refresh_search_vector
before insert or update of content_text on public.curriculum_chunks
for each row execute function app.refresh_curriculum_chunk_search_vector();

-- Backfill existing chunks once so lexical retrieval works for the current corpus.
update public.curriculum_chunks
   set search_vector = to_tsvector('simple'::regconfig, coalesce(content_text, '')),
       updated_at = now()
 where search_vector is null;

create or replace function public.search_curriculum_hybrid(
  p_query_text text,
  p_query_embedding extensions.vector(1536),
  p_tenant_id uuid,
  p_school_id uuid default null,
  p_subject_code text default null,
  p_grade_code text default null,
  p_source_version_id uuid default null,
  p_limit integer default 8
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_version_id uuid,
  source_title text,
  version_label text,
  subject_code text,
  grade_code text,
  sharing_scope text,
  chapter_title text,
  section_title text,
  page_start integer,
  page_end integer,
  content_text text,
  similarity_score numeric,
  lexical_rank bigint,
  semantic_rank bigint,
  retrieval_score numeric,
  citation_label text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, app, extensions
as $$
declare
  query_text text := nullif(trim(coalesce(p_query_text, '')), '');
begin
  if query_text is null then
    raise exception 'A non-empty curriculum query is required';
  end if;
  if p_tenant_id is null then
    raise exception 'A tenant scope is required for school curriculum retrieval';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'p_limit must be between 1 and 20';
  end if;

  return query
  with permitted_sources as materialized (
    select
      cs.id,
      cs.title,
      cs.subject_code,
      cs.grade_code,
      cs.sharing_scope
    from public.curriculum_sources cs
    where cs.status = 'active'
      and cs.rights_status = 'approved'
      and 'rag' = any(cs.permitted_uses)
      and (p_subject_code is null or cs.subject_code = p_subject_code)
      and (p_grade_code is null or cs.grade_code = p_grade_code)
      and (
        (cs.sharing_scope = 'platform')
        or (cs.sharing_scope = 'tenant' and cs.tenant_id = p_tenant_id)
        or (
          cs.sharing_scope = 'school'
          and cs.tenant_id = p_tenant_id
          and p_school_id is not null
          and cs.school_id = p_school_id
        )
      )
  ),
  lexical_candidates as (
    select
      cc.id as chunk_id,
      row_number() over (
        order by ts_rank_cd(
          cc.search_vector,
          plainto_tsquery('simple'::regconfig, query_text)
        ) desc, cc.id
      ) as position
    from public.curriculum_chunks cc
    join permitted_sources ps on ps.id = cc.source_id
    join public.curriculum_source_versions cv
      on cv.id = cc.source_version_id
     and cv.ingestion_status = 'ready'
    where cc.search_vector @@ plainto_tsquery('simple'::regconfig, query_text)
      and (p_source_version_id is null or cc.source_version_id = p_source_version_id)
    order by ts_rank_cd(
      cc.search_vector,
      plainto_tsquery('simple'::regconfig, query_text)
    ) desc, cc.id
    limit 60
  ),
  semantic_candidates as (
    select
      cc.id as chunk_id,
      row_number() over (
        order by cc.embedding <=> p_query_embedding, cc.id
      ) as position,
      greatest(0, least(1, 1 - (cc.embedding <=> p_query_embedding)))::numeric as similarity
    from public.curriculum_chunks cc
    join permitted_sources ps on ps.id = cc.source_id
    join public.curriculum_source_versions cv
      on cv.id = cc.source_version_id
     and cv.ingestion_status = 'ready'
    where cc.embedding is not null
      and (p_source_version_id is null or cc.source_version_id = p_source_version_id)
    order by cc.embedding <=> p_query_embedding, cc.id
    limit 60
  ),
  fused_positions as (
    select
      lc.chunk_id,
      1.0::numeric / (60 + lc.position)::numeric as rrf_score
    from lexical_candidates lc
    union all
    select
      sc.chunk_id,
      1.0::numeric / (60 + sc.position)::numeric as rrf_score
    from semantic_candidates sc
  ),
  fused as (
    select
      fp.chunk_id,
      sum(fp.rrf_score)::numeric as combined_score
    from fused_positions fp
    group by fp.chunk_id
  ),
  top_chunks as (
    select
      f.chunk_id,
      f.combined_score,
      lc.position as lexical_position,
      sc.position as semantic_position,
      sc.similarity
    from fused f
    left join lexical_candidates lc on lc.chunk_id = f.chunk_id
    left join semantic_candidates sc on sc.chunk_id = f.chunk_id
    order by f.combined_score desc, f.chunk_id
    limit p_limit
  )
  select
    cc.id,
    cc.source_id,
    cc.source_version_id,
    ps.title,
    cv.version_label,
    ps.subject_code,
    ps.grade_code,
    ps.sharing_scope,
    cc.chapter_title,
    cc.section_title,
    cc.page_start,
    cc.page_end,
    cc.content_text,
    coalesce(tc.similarity, 0)::numeric,
    tc.lexical_position,
    tc.semantic_position,
    tc.combined_score,
    concat(
      ps.title,
      ' — ',
      cv.version_label,
      case
        when cc.page_start is null then ''
        when cc.page_end is null or cc.page_end = cc.page_start then concat(' — ص. ', cc.page_start)
        else concat(' — ص. ', cc.page_start, '-', cc.page_end)
      end
    )::text
  from top_chunks tc
  join public.curriculum_chunks cc on cc.id = tc.chunk_id
  join permitted_sources ps on ps.id = cc.source_id
  join public.curriculum_source_versions cv
    on cv.id = cc.source_version_id
   and cv.ingestion_status = 'ready'
  order by tc.combined_score desc, cc.id;
end;
$$;

revoke all on function public.search_curriculum_hybrid(
  text, extensions.vector, uuid, uuid, text, text, uuid, integer
) from public, anon, authenticated, myschool_runtime;

grant execute on function public.search_curriculum_hybrid(
  text, extensions.vector, uuid, uuid, text, text, uuid, integer
) to service_role;

create index if not exists curriculum_chunks_source_status_idx
  on public.curriculum_chunks(source_id, status, source_version_id, chunk_index);

commit;
