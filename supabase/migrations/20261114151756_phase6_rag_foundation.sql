begin;

create extension if not exists vector with schema extensions;
grant usage on schema extensions to myschool_runtime;

-- Composite keys ensure every chunk stays attached to the exact source version and school.
alter table public.content_items
  add constraint content_items_id_tenant_school_unique unique (id, tenant_id, school_id);
alter table public.content_versions
  add constraint content_versions_scope_unique unique (id, content_item_id, tenant_id, school_id);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  content_item_id uuid not null,
  content_version_id uuid,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(trim(content)) > 0),
  token_count integer check (token_count is null or token_count > 0),
  content_hash text not null,
  embedding extensions.vector,
  embedding_model text,
  embedding_dimensions integer check (embedding_dimensions is null or embedding_dimensions between 1 and 16000),
  status text not null default 'pending' check (status in ('pending','embedded','failed','archived')),
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (content_item_id, tenant_id, school_id)
    references public.content_items(id, tenant_id, school_id) on delete cascade,
  foreign key (content_version_id, content_item_id, tenant_id, school_id)
    references public.content_versions(id, content_item_id, tenant_id, school_id) on delete cascade,
  check ((embedding is null and embedding_model is null and embedding_dimensions is null and status <> 'embedded')
      or (embedding is not null and embedding_model is not null and embedding_dimensions is not null and status = 'embedded'))
);

create unique index knowledge_chunks_version_index_uidx
  on public.knowledge_chunks(
    content_item_id,
    coalesce(content_version_id,'00000000-0000-0000-0000-000000000000'::uuid),
    chunk_index
  );
create index knowledge_chunks_scope_status_idx
  on public.knowledge_chunks(tenant_id,school_id,status,content_item_id);
create index knowledge_chunks_content_hash_idx
  on public.knowledge_chunks(content_item_id,content_hash);

alter table public.knowledge_chunks enable row level security;
create policy knowledge_chunks_read on public.knowledge_chunks
  for select to myschool_runtime
  using (
    tenant_id=app.current_tenant_id()
    and (app.current_school_id() is null or school_id=app.current_school_id())
    and app.can_access_content_item(content_item_id,tenant_id,school_id)
  );
create policy knowledge_chunks_write on public.knowledge_chunks
  for all to myschool_runtime
  using (app.has_permission('content.manage',tenant_id,school_id,null))
  with check (app.has_permission('content.manage',tenant_id,school_id,null));

-- Server-side semantic retrieval. Tenant/school scope comes from the transaction context,
-- never from caller-supplied tenant identifiers. The CASE prevents mixed-dimension vectors
-- from reaching the distance operator before dimensions are checked.
create or replace function app.match_knowledge_chunks(
  p_query_embedding extensions.vector,
  p_min_similarity real default 0.25,
  p_match_count integer default 10
)
returns table (
  chunk_id uuid,
  content_item_id uuid,
  title text,
  chunk_text text,
  similarity real,
  metadata jsonb
)
language sql stable security invoker
set search_path = pg_catalog, app, public, extensions
as $$
  select ranked.chunk_id, ranked.content_item_id, ranked.title, ranked.chunk_text,
         (1 - ranked.distance)::real as similarity, ranked.metadata
  from (
    select kc.id as chunk_id, kc.content_item_id, ci.title, kc.content as chunk_text,
           case when extensions.vector_dims(kc.embedding)=extensions.vector_dims(p_query_embedding)
                then kc.embedding <=> p_query_embedding end as distance,
           kc.metadata
    from public.knowledge_chunks kc
    join public.content_items ci
      on ci.id=kc.content_item_id and ci.tenant_id=kc.tenant_id and ci.school_id=kc.school_id
    where kc.embedding is not null
      and kc.status='embedded'
      and kc.tenant_id=app.current_tenant_id()
      and (app.current_school_id() is null or kc.school_id=app.current_school_id())
      and app.can_access_content_item(ci.id,ci.tenant_id,ci.school_id)
  ) ranked
  where ranked.distance is not null
    and (1-ranked.distance) >= greatest(-1::real,least(1::real,coalesce(p_min_similarity,0.25)))
  order by ranked.distance asc
  limit greatest(1,least(coalesce(p_match_count,10),30));
$$;

revoke all on public.knowledge_chunks from public,anon,authenticated;
grant select,insert,update,delete on public.knowledge_chunks to myschool_runtime;
revoke all on function app.match_knowledge_chunks(extensions.vector,real,integer) from public,anon,authenticated;
grant execute on function app.match_knowledge_chunks(extensions.vector,real,integer) to myschool_runtime;

commit;