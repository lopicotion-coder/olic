-- Enforce existing tenant/school AI budgets in the background worker.
-- Reservations are locked against the selected budget row; settlements are idempotent per ai_request.

begin;

create or replace function public.worker_reserve_ai_budget(
  p_request_id uuid,
  p_tenant_id uuid,
  p_school_id uuid,
  p_user_id uuid,
  p_feature_key public.ai_feature_key,
  p_estimated_amount numeric,
  p_estimated_input_tokens integer,
  p_requested_output_tokens integer
)
returns table (
  reservation_id uuid,
  budget_id uuid,
  max_input_tokens integer,
  max_output_tokens integer,
  monthly_request_limit integer,
  currency character(3)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  budget_row public.ai_budgets%rowtype;
  reservation_row public.ai_budget_reservations%rowtype;
  month_start timestamptz := date_trunc('month', now());
  request_count bigint;
  spent_amount numeric(14,8);
  reserved_amount numeric(14,8);
  remaining_amount numeric(14,8);
  estimate numeric(14,8);
begin
  if p_request_id is null or p_tenant_id is null or p_user_id is null then
    raise exception 'Request, tenant and user are required';
  end if;
  if p_estimated_amount is null or p_estimated_amount < 0 then
    raise exception 'Estimated cost must be zero or greater';
  end if;
  if p_estimated_input_tokens is null or p_estimated_input_tokens < 0
     or p_requested_output_tokens is null or p_requested_output_tokens < 1 then
    raise exception 'Invalid token estimate';
  end if;

  delete from public.ai_budget_reservations r
  where r.expires_at <= now();

  select *
    into budget_row
    from public.ai_budgets b
   where b.tenant_id = p_tenant_id
     and b.is_active
     and (
       b.school_id is not distinct from p_school_id
       or (p_school_id is not null and b.school_id is null)
     )
   order by case when b.school_id is not distinct from p_school_id then 0 else 1 end
   limit 1
   for update;

  if not found then
    raise exception 'No active AI budget is configured for this tenant/school';
  end if;

  select *
    into reservation_row
    from public.ai_budget_reservations r
   where r.request_id = p_request_id
   for update;

  if found then
    if reservation_row.budget_id <> budget_row.id then
      raise exception 'AI request already has a reservation for a different budget';
    end if;

    return query select
      reservation_row.id,
      reservation_row.budget_id,
      budget_row.max_input_tokens,
      budget_row.max_output_tokens,
      budget_row.monthly_request_limit,
      budget_row.currency;
    return;
  end if;

  if p_estimated_input_tokens > budget_row.max_input_tokens then
    raise exception 'AI request exceeds the budget input-token limit';
  end if;
  if p_requested_output_tokens > budget_row.max_output_tokens then
    raise exception 'AI request exceeds the budget output-token limit';
  end if;

  select count(*) into request_count
    from public.ai_requests r
   where r.tenant_id = p_tenant_id
     and r.school_id is not distinct from p_school_id
     and r.feature_key = p_feature_key
     and r.created_at >= month_start;

  if request_count > budget_row.monthly_request_limit then
    raise exception 'The monthly AI request limit has been exceeded';
  end if;

  select coalesce(sum(e.billed_amount), 0)
    into spent_amount
    from public.ai_budget_events e
   where e.budget_id = budget_row.id
     and e.created_at >= month_start
     and e.outcome in ('completed', 'failed', 'blocked');

  select coalesce(sum(r.reserved_amount), 0)
    into reserved_amount
    from public.ai_budget_reservations r
   where r.budget_id = budget_row.id
     and r.expires_at > now();

  estimate := p_estimated_amount;
  remaining_amount := budget_row.monthly_budget_amount - spent_amount - reserved_amount;

  if estimate > remaining_amount then
    raise exception 'The remaining monthly AI budget is insufficient for this request';
  end if;

  insert into public.ai_budget_reservations (
    request_id, budget_id, tenant_id, school_id, user_id,
    reserved_amount, expires_at
  )
  values (
    p_request_id,
    budget_row.id,
    p_tenant_id,
    p_school_id,
    p_user_id,
    estimate,
    now() + interval '10 minutes'
  )
  returning * into reservation_row;

  return query select
    reservation_row.id,
    reservation_row.budget_id,
    budget_row.max_input_tokens,
    budget_row.max_output_tokens,
    budget_row.monthly_request_limit,
    budget_row.currency;
end;
$$;

create or replace function public.worker_settle_ai_budget(
  p_request_id uuid,
  p_budget_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_billed_amount numeric,
  p_outcome text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reservation_row public.ai_budget_reservations%rowtype;
  request_row public.ai_requests%rowtype;
begin
  if p_request_id is null or p_budget_id is null then
    raise exception 'Request and budget are required';
  end if;
  if p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_billed_amount is null or p_billed_amount < 0 then
    raise exception 'Invalid AI usage settlement values';
  end if;
  if p_outcome not in ('completed', 'failed', 'blocked') then
    raise exception 'Invalid AI budget event outcome';
  end if;

  select * into request_row
  from public.ai_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'AI request not found'; end if;

  if exists (select 1 from public.ai_budget_events where request_id = p_request_id) then
    delete from public.ai_budget_reservations where request_id = p_request_id;
    return false;
  end if;

  select * into reservation_row
  from public.ai_budget_reservations
  where request_id = p_request_id
  for update;
  if not found then raise exception 'AI budget reservation not found'; end if;
  if reservation_row.budget_id <> p_budget_id then
    raise exception 'AI budget reservation scope mismatch';
  end if;

  if p_outcome = 'completed' and p_billed_amount > reservation_row.reserved_amount then
    raise exception 'Actual AI cost exceeded the reserved amount';
  end if;

  insert into public.ai_budget_events (
    request_id, budget_id, tenant_id, school_id, user_id, feature_key,
    input_tokens, output_tokens, billed_amount, currency, outcome, metadata
  )
  values (
    p_request_id,
    p_budget_id,
    reservation_row.tenant_id,
    reservation_row.school_id,
    reservation_row.user_id,
    request_row.feature_key,
    p_input_tokens,
    p_output_tokens,
    p_billed_amount,
    (select b.currency from public.ai_budgets b where b.id = p_budget_id),
    p_outcome,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (request_id) do nothing;

  delete from public.ai_budget_reservations where request_id = p_request_id;
  return true;
end;
$$;

create or replace function public.worker_release_ai_budget_reservation(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_count integer;
begin
  delete from public.ai_budget_reservations
   where request_id = p_request_id;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.worker_reserve_ai_budget(uuid, uuid, uuid, uuid, public.ai_feature_key, numeric, integer, integer)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_settle_ai_budget(uuid, uuid, integer, integer, numeric, text, jsonb)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_release_ai_budget_reservation(uuid)
  from public, anon, authenticated, myschool_runtime;

grant execute on function public.worker_reserve_ai_budget(uuid, uuid, uuid, uuid, public.ai_feature_key, numeric, integer, integer)
  to service_role;
grant execute on function public.worker_settle_ai_budget(uuid, uuid, integer, integer, numeric, text, jsonb)
  to service_role;
grant execute on function public.worker_release_ai_budget_reservation(uuid)
  to service_role;

commit;
