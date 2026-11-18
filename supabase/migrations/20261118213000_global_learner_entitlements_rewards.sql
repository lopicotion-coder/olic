-- Phase 1 and shared product foundations.
-- Additive only: existing school-scoped student rows remain intact and are linked to a global learner profile.

begin;

create table if not exists public.learner_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid unique references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  display_name text,
  date_of_birth date,
  preferred_locale text not null default 'ar',
  identity_fingerprint char(64),
  identity_key_version smallint,
  profile_status text not null default 'active'
    check (profile_status in ('pending', 'active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (identity_fingerprint is null and identity_key_version is null)
    or
    (identity_fingerprint ~ '^[0-9a-f]{64}$' and identity_key_version is not null and identity_key_version > 0)
  )
);

create unique index if not exists learner_profiles_identity_fingerprint_uidx
  on public.learner_profiles(identity_fingerprint)
  where identity_fingerprint is not null;

create index if not exists learner_profiles_creator_idx
  on public.learner_profiles(created_by_user_id)
  where created_by_user_id is not null;

create table if not exists public.learner_guardians (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null check (relationship in ('father', 'mother', 'guardian', 'other')),
  link_status text not null default 'pending'
    check (link_status in ('pending', 'active', 'revoked')),
  can_view_progress boolean not null default true,
  can_manage_learning boolean not null default true,
  can_manage_payments boolean not null default false,
  is_primary boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_profile_id, guardian_user_id)
);

create index if not exists learner_guardians_guardian_idx
  on public.learner_guardians(guardian_user_id, link_status);

create table if not exists public.learner_school_memberships (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid references public.students(id) on delete set null,
  membership_status text not null default 'pending'
    check (membership_status in ('pending', 'active', 'rejected', 'ended')),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  starts_on date,
  ends_on date,
  transfer_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists learner_school_memberships_one_open_request_uidx
  on public.learner_school_memberships(learner_profile_id, school_id)
  where membership_status in ('pending', 'active');

create index if not exists learner_school_memberships_student_idx
  on public.learner_school_memberships(student_id)
  where student_id is not null;

alter table public.students
  add column if not exists learner_profile_id uuid
  references public.learner_profiles(id) on delete set null;

create index if not exists students_learner_profile_idx
  on public.students(learner_profile_id)
  where learner_profile_id is not null;

-- Backfill one global identity per already-linked student account.
-- This does not merge school records or change the existing profile_id login binding.
insert into public.learner_profiles (
  owner_user_id, created_by_user_id, first_name, middle_name, last_name,
  display_name, date_of_birth, profile_status
)
select
  s.profile_id,
  s.profile_id,
  min(s.first_name),
  min(s.middle_name),
  min(s.last_name),
  min(trim(concat_ws(' ', s.first_name, s.middle_name, s.last_name))),
  min(s.date_of_birth),
  'active'
from public.students s
where s.profile_id is not null
group by s.profile_id
on conflict (owner_user_id) do nothing;

update public.students s
   set learner_profile_id = lp.id,
       updated_at = now()
  from public.learner_profiles lp
 where lp.owner_user_id = s.profile_id
   and s.profile_id is not null
   and s.learner_profile_id is null;

-- Preserve school history as memberships, without exposing one school's private records to another.
insert into public.learner_school_memberships (
  learner_profile_id, tenant_id, school_id, student_id, membership_status,
  requested_by_user_id, starts_on, ends_on, created_at, updated_at
)
select
  s.learner_profile_id,
  s.tenant_id,
  s.school_id,
  s.id,
  case when s.status::text = 'active' then 'active' else 'ended' end,
  s.profile_id,
  coalesce(s.admission_date, s.created_at::date),
  case when s.status::text = 'active' then null else current_date end,
  now(),
  now()
from public.students s
where s.learner_profile_id is not null
  and not exists (
    select 1
    from public.learner_school_memberships m
    where m.learner_profile_id = s.learner_profile_id
      and m.school_id = s.school_id
      and m.student_id = s.id
  );

create table if not exists public.learner_subscriptions (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete restrict,
  subscription_plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired', 'refunded')),
  starts_on date not null default current_date,
  ends_on date,
  auto_renew boolean not null default true,
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'quarterly', 'annual', 'one_time')),
  price_amount numeric(12,2) not null default 0 check (price_amount >= 0),
  currency char(3) not null default 'EGP',
  payment_provider text,
  external_subscription_reference text,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists learner_subscriptions_current_idx
  on public.learner_subscriptions(learner_profile_id, status, starts_on, ends_on);

create unique index if not exists learner_subscriptions_external_reference_uidx
  on public.learner_subscriptions(payment_provider, external_subscription_reference)
  where external_subscription_reference is not null;

create table if not exists public.learner_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean not null,
  source_reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists learner_entitlement_overrides_active_idx
  on public.learner_entitlement_overrides(learner_profile_id, feature_key, starts_at, ends_at);

create table if not exists public.academy_videos (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text not null unique,
  title text not null,
  description text,
  subject_code text,
  grade_code text,
  curriculum_board text,
  education_system text,
  source_version_id uuid references public.curriculum_source_versions(id) on delete set null,
  unit_title text,
  lesson_title text,
  language_code text not null default 'ar',
  channel_name text,
  teacher_user_id uuid references auth.users(id) on delete set null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  thumbnail_url text,
  video_url text generated always as ('https://www.youtube.com/watch?v=' || youtube_video_id) stored,
  content_origin text not null default 'my_school_academy'
    check (content_origin in ('my_school_academy', 'external_teacher', 'partner')),
  review_status text not null default 'pending_review'
    check (review_status in ('pending_review', 'approved', 'rejected', 'needs_review')),
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'unlisted', 'archived')),
  published_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_videos_curriculum_idx
  on public.academy_videos(subject_code, grade_code, curriculum_board, lesson_title)
  where publication_status = 'published' and review_status = 'approved';

create table if not exists public.learner_referral_codes (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null unique references public.learner_profiles(id) on delete cascade,
  referral_code text not null unique,
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.learner_referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.learner_referral_codes(id) on delete restrict,
  referred_learner_profile_id uuid not null unique references public.learner_profiles(id) on delete restrict,
  referral_status text not null default 'pending'
    check (referral_status in ('pending', 'registered', 'paid', 'eligible', 'reversed', 'rejected')),
  qualifying_subscription_id uuid references public.learner_subscriptions(id) on delete set null,
  qualified_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learner_reward_rules (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null,
  minimum_eligible_referrals integer not null check (minimum_eligible_referrals > 0),
  reward_type text not null
    check (reward_type in ('free_subscription_days', 'gems', 'friend_discount')),
  reward_value integer not null check (reward_value > 0),
  reward_metadata jsonb not null default '{}'::jsonb,
  stacking_policy text not null default 'highest_only'
    check (stacking_policy in ('highest_only', 'stack', 'incremental')),
  maximum_redemptions integer,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_enabled boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.learner_rewards (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete restrict,
  reward_rule_id uuid references public.learner_reward_rules(id) on delete set null,
  reward_type text not null
    check (reward_type in ('free_subscription_days', 'gems', 'friend_discount')),
  reward_value integer not null check (reward_value > 0),
  reward_status text not null default 'issued'
    check (reward_status in ('issued', 'reserved', 'redeemed', 'expired', 'revoked')),
  idempotency_key text not null unique,
  expires_at timestamptz,
  redeemed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.learner_gems_ledger (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete restrict,
  amount bigint not null check (amount <> 0),
  transaction_type text not null
    check (transaction_type in ('referral_reward', 'campaign_reward', 'redemption', 'reversal', 'expiry', 'admin_adjustment')),
  idempotency_key text not null unique,
  reference_type text,
  reference_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists learner_gems_ledger_recent_idx
  on public.learner_gems_ledger(learner_profile_id, created_at desc);

create table if not exists public.learner_xp_events (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete restrict,
  xp_delta integer not null check (xp_delta <> 0),
  event_type text not null,
  idempotency_key text not null unique,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists learner_xp_events_recent_idx
  on public.learner_xp_events(learner_profile_id, created_at desc);

create table if not exists public.learning_competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  competition_scope text not null
    check (competition_scope in ('platform', 'tenant', 'school', 'class', 'friends')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  subject_code text,
  grade_code text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  scoring_rules jsonb not null default '{"accuracy_weight":0.45,"improvement_weight":0.25,"difficulty_weight":0.2,"consistency_weight":0.1}'::jsonb,
  privacy_mode text not null default 'private_by_default'
    check (privacy_mode in ('private_by_default', 'school_only', 'public_opt_in')),
  competition_status text not null default 'draft'
    check (competition_status in ('draft', 'scheduled', 'active', 'completed', 'canceled')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (
    (competition_scope = 'platform' and tenant_id is null and school_id is null and class_id is null)
    or (competition_scope = 'tenant' and tenant_id is not null and school_id is null and class_id is null)
    or (competition_scope = 'school' and tenant_id is not null and school_id is not null and class_id is null)
    or (competition_scope = 'class' and tenant_id is not null and school_id is not null and class_id is not null)
    or (competition_scope = 'friends')
  )
);

create table if not exists public.learning_competition_entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.learning_competitions(id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  score numeric(12,4) not null default 0,
  accuracy_score numeric(8,4) not null default 0,
  improvement_score numeric(8,4) not null default 0,
  difficulty_score numeric(8,4) not null default 0,
  consistency_score numeric(8,4) not null default 0,
  opted_into_leaderboard boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, learner_profile_id)
);

create index if not exists learning_competition_entries_score_idx
  on public.learning_competition_entries(competition_id, score desc);

-- Parent-owned child profiles are created through this RPC, never by accepting a guardian id from the browser.
create or replace function public.create_child_learner_profile(
  p_first_name text,
  p_last_name text,
  p_date_of_birth date,
  p_relationship text default 'guardian'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  learner_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.parent_accounts where user_id = actor_id) then
    raise exception 'A parent account is required to create a child learner profile';
  end if;
  if length(trim(coalesce(p_first_name, ''))) < 1 or length(trim(coalesce(p_last_name, ''))) < 1 then
    raise exception 'First name and last name are required';
  end if;
  if p_relationship not in ('father', 'mother', 'guardian', 'other') then
    raise exception 'Invalid guardian relationship';
  end if;
  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;

  insert into public.learner_profiles (
    owner_user_id, created_by_user_id, first_name, last_name, display_name,
    date_of_birth, preferred_locale, profile_status
  )
  values (
    null, actor_id, trim(p_first_name), trim(p_last_name),
    trim(concat_ws(' ', trim(p_first_name), trim(p_last_name))),
    p_date_of_birth, 'ar', 'active'
  )
  returning id into learner_id;

  insert into public.learner_guardians (
    learner_profile_id, guardian_user_id, relationship, link_status,
    can_view_progress, can_manage_learning, can_manage_payments,
    is_primary, created_by_user_id, verified_at
  )
  values (
    learner_id, actor_id, p_relationship, 'active',
    true, true, true, true, actor_id, now()
  );

  return learner_id;
end;
$$;

create or replace function public.create_own_learner_profile(
  p_first_name text,
  p_last_name text,
  p_date_of_birth date default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  learner_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_first_name, ''))) < 1 or length(trim(coalesce(p_last_name, ''))) < 1 then
    raise exception 'First name and last name are required';
  end if;
  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;

  insert into public.learner_profiles (
    owner_user_id, created_by_user_id, first_name, last_name,
    display_name, date_of_birth, preferred_locale, profile_status
  )
  values (
    actor_id, actor_id, trim(p_first_name), trim(p_last_name),
    trim(concat_ws(' ', trim(p_first_name), trim(p_last_name))),
    p_date_of_birth, 'ar', 'active'
  )
  on conflict (owner_user_id) do update
    set updated_at = now()
  returning id into learner_id;

  return learner_id;
end;
$$;

create or replace function public.request_learner_school_membership(
  p_learner_profile_id uuid,
  p_school_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, app
as $$
declare
  actor_id uuid := auth.uid();
  school_tenant_id uuid;
  membership_id uuid;
  can_access boolean;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select (
    lp.owner_user_id = actor_id
    or exists (
      select 1 from public.learner_guardians g
      where g.learner_profile_id = lp.id
        and g.guardian_user_id = actor_id
        and g.link_status = 'active'
    )
  )
  into can_access
  from public.learner_profiles lp
  where lp.id = p_learner_profile_id
    and lp.profile_status = 'active';

  if not coalesce(can_access, false) then raise exception 'Learner profile access denied'; end if;

  select s.tenant_id into school_tenant_id
  from public.schools s
  where s.id = p_school_id and s.status = 'active';

  if school_tenant_id is null then raise exception 'School is unavailable'; end if;

  select id into membership_id
  from public.learner_school_memberships
  where learner_profile_id = p_learner_profile_id
    and school_id = p_school_id
    and membership_status in ('pending', 'active')
  order by created_at desc
  limit 1;

  if membership_id is not null then return membership_id; end if;

  insert into public.learner_school_memberships (
    learner_profile_id, tenant_id, school_id, membership_status, requested_by_user_id
  )
  values (p_learner_profile_id, school_tenant_id, p_school_id, 'pending', actor_id)
  returning id into membership_id;

  return membership_id;
end;
$$;

create or replace function public.review_learner_school_membership(
  p_membership_id uuid,
  p_decision text,
  p_notes text default null
)
returns public.learner_school_memberships
language plpgsql
security definer
set search_path = pg_catalog, public, auth, app
as $$
declare
  actor_id uuid := auth.uid();
  membership_row public.learner_school_memberships%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Decision must be approve or reject'; end if;

  select * into membership_row
  from public.learner_school_memberships
  where id = p_membership_id
  for update;

  if not found then raise exception 'Membership request not found'; end if;
  if not app.has_permission('students.manage', membership_row.tenant_id, membership_row.school_id, null) then
    raise exception 'School student-management permission required';
  end if;
  if membership_row.membership_status <> 'pending' then
    raise exception 'Only pending membership requests can be reviewed';
  end if;

  update public.learner_school_memberships
     set membership_status = case when p_decision = 'approve' then 'active' else 'rejected' end,
         reviewed_by_user_id = actor_id,
         reviewed_at = now(),
         starts_on = case when p_decision = 'approve' then current_date else starts_on end,
         notes = coalesce(p_notes, notes),
         updated_at = now()
   where id = p_membership_id
  returning * into membership_row;

  return membership_row;
end;
$$;

create or replace function public.link_learner_school_roster_record(
  p_membership_id uuid,
  p_student_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, app
as $$
declare
  actor_id uuid := auth.uid();
  membership_row public.learner_school_memberships%rowtype;
  student_row public.students%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select * into membership_row
  from public.learner_school_memberships
  where id = p_membership_id and membership_status = 'active'
  for update;
  if not found then raise exception 'Active learner-school membership not found'; end if;

  if not app.has_permission('students.manage', membership_row.tenant_id, membership_row.school_id, null) then
    raise exception 'School student-management permission required';
  end if;

  select * into student_row
  from public.students
  where id = p_student_id
    and tenant_id = membership_row.tenant_id
    and school_id = membership_row.school_id
  for update;
  if not found then raise exception 'Student roster record is not in the selected school'; end if;

  if student_row.learner_profile_id is not null
     and student_row.learner_profile_id <> membership_row.learner_profile_id then
    raise exception 'Student roster record is already linked to a different learner identity';
  end if;

  update public.students
     set learner_profile_id = membership_row.learner_profile_id,
         updated_at = now()
   where id = p_student_id;

  update public.learner_school_memberships
     set student_id = p_student_id, updated_at = now()
   where id = p_membership_id;

  return p_student_id;
end;
$$;

create or replace function public.resolve_learner_entitlements(
  p_learner_profile_id uuid
)
returns table (
  feature_key text,
  source_type text,
  source_id uuid,
  ends_on date
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  allowed boolean;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select (
    lp.owner_user_id = actor_id
    or exists (
      select 1 from public.learner_guardians g
      where g.learner_profile_id = lp.id
        and g.guardian_user_id = actor_id
        and g.link_status = 'active'
        and (g.can_view_progress or g.can_manage_learning or g.can_manage_payments)
    )
  )
  into allowed
  from public.learner_profiles lp
  where lp.id = p_learner_profile_id;

  if not coalesce(allowed, false) then raise exception 'Learner profile access denied'; end if;

  return query
  with school_features as (
    select
      feature.key as feature_key,
      'school'::text as source_type,
      ts.id as source_id,
      ts.ends_on as ends_on,
      1 as priority
    from public.learner_school_memberships lm
    join public.tenant_subscriptions ts
      on ts.tenant_id = lm.tenant_id
     and ts.status in ('active', 'trialing')
     and ts.starts_on <= current_date
     and (ts.ends_on is null or ts.ends_on >= current_date)
     and (ts.trial_ends_on is null or ts.trial_ends_on >= current_date)
    join public.subscription_plans sp
      on sp.id = ts.subscription_plan_id
     and sp.status = 'active'
    cross join lateral jsonb_each(sp.features) feature
    where lm.learner_profile_id = p_learner_profile_id
      and lm.membership_status = 'active'
      and (
        feature.value = 'true'::jsonb
        or feature.value ->> 'enabled' = 'true'
        or feature.value ->> 'included' = 'true'
      )
  ),
  individual_features as (
    select
      feature.key as feature_key,
      'individual'::text as source_type,
      ls.id as source_id,
      ls.ends_on as ends_on,
      2 as priority
    from public.learner_subscriptions ls
    join public.subscription_plans sp
      on sp.id = ls.subscription_plan_id
     and sp.status = 'active'
    cross join lateral jsonb_each(sp.features) feature
    where ls.learner_profile_id = p_learner_profile_id
      and ls.status in ('active', 'trialing')
      and ls.starts_on <= current_date
      and (ls.ends_on is null or ls.ends_on >= current_date)
      and (
        feature.value = 'true'::jsonb
        or feature.value ->> 'enabled' = 'true'
        or feature.value ->> 'included' = 'true'
      )
  ),
  overrides as (
    select
      eo.feature_key,
      case when eo.is_enabled then 'override' else 'revoked_override' end as source_type,
      eo.id as source_id,
      eo.ends_at::date as ends_on,
      case when eo.is_enabled then 0 else -1 end as priority
    from public.learner_entitlement_overrides eo
    where eo.learner_profile_id = p_learner_profile_id
      and eo.starts_at <= now()
      and (eo.ends_at is null or eo.ends_at > now())
  ),
  combined as (
    select * from overrides
    union all
    select * from school_features
    union all
    select * from individual_features
  )
  select distinct on (combined.feature_key)
    combined.feature_key,
    combined.source_type,
    combined.source_id,
    combined.ends_on
  from combined
  order by combined.feature_key, combined.priority;
end;
$$;

create or replace function public.get_learner_gems_balance(
  p_learner_profile_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  allowed boolean;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select (
    lp.owner_user_id = actor_id
    or exists (
      select 1 from public.learner_guardians g
      where g.learner_profile_id = lp.id
        and g.guardian_user_id = actor_id
        and g.link_status = 'active'
        and g.can_manage_learning
    )
  )
  into allowed
  from public.learner_profiles lp
  where lp.id = p_learner_profile_id;

  if not coalesce(allowed, false) then raise exception 'Learner profile access denied'; end if;

  return coalesce((
    select sum(l.amount)
    from public.learner_gems_ledger l
    where l.learner_profile_id = p_learner_profile_id
  ), 0);
end;
$$;

create or replace function public.redeem_learner_gems(
  p_learner_profile_id uuid,
  p_amount bigint,
  p_idempotency_key text,
  p_reference_type text,
  p_reference_id uuid default null,
  p_description text default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  learner_row public.learner_profiles%rowtype;
  balance bigint;
  inserted_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_amount <= 0 then raise exception 'Redemption amount must be positive'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 12 then
    raise exception 'A stable idempotency key is required';
  end if;

  select * into learner_row
  from public.learner_profiles
  where id = p_learner_profile_id
  for update;
  if not found then raise exception 'Learner profile not found'; end if;

  if learner_row.owner_user_id <> actor_id and not exists (
    select 1 from public.learner_guardians g
    where g.learner_profile_id = p_learner_profile_id
      and g.guardian_user_id = actor_id
      and g.link_status = 'active'
      and g.can_manage_payments
  ) then
    raise exception 'Gems redemption permission denied';
  end if;

  if exists (select 1 from public.learner_gems_ledger where idempotency_key = p_idempotency_key) then
    return coalesce((
      select sum(amount) from public.learner_gems_ledger
      where learner_profile_id = p_learner_profile_id
    ), 0);
  end if;

  select coalesce(sum(amount), 0) into balance
  from public.learner_gems_ledger
  where learner_profile_id = p_learner_profile_id;

  if balance < p_amount then raise exception 'Insufficient Gems balance'; end if;

  insert into public.learner_gems_ledger (
    learner_profile_id, amount, transaction_type, idempotency_key,
    reference_type, reference_id, description, created_by_user_id
  )
  values (
    p_learner_profile_id, -p_amount, 'redemption', p_idempotency_key,
    p_reference_type, p_reference_id, p_description, actor_id
  )
  returning id into inserted_id;

  return balance - p_amount;
end;
$$;

-- RLS and grants: users can read only their own profile, linked children, and explicitly visible activity.
alter table public.learner_profiles enable row level security;
alter table public.learner_guardians enable row level security;
alter table public.learner_school_memberships enable row level security;
alter table public.learner_subscriptions enable row level security;
alter table public.learner_entitlement_overrides enable row level security;
alter table public.academy_videos enable row level security;
alter table public.learner_referral_codes enable row level security;
alter table public.learner_referral_attributions enable row level security;
alter table public.learner_reward_rules enable row level security;
alter table public.learner_rewards enable row level security;
alter table public.learner_gems_ledger enable row level security;
alter table public.learner_xp_events enable row level security;
alter table public.learning_competitions enable row level security;
alter table public.learning_competition_entries enable row level security;

drop policy if exists learner_profiles_read on public.learner_profiles;
create policy learner_profiles_read on public.learner_profiles
for select to authenticated, myschool_runtime
using (
  owner_user_id = (select auth.uid())
  or created_by_user_id = (select auth.uid())
  or exists (
    select 1 from public.learner_guardians g
    where g.learner_profile_id = learner_profiles.id
      and g.guardian_user_id = (select auth.uid())
      and g.link_status = 'active'
  )
  or exists (
    select 1 from public.learner_school_memberships m
    where m.learner_profile_id = learner_profiles.id
      and m.membership_status = 'active'
      and app.has_permission('students.read', m.tenant_id, m.school_id, null)
  )
);

drop policy if exists learner_guardians_read on public.learner_guardians;
create policy learner_guardians_read on public.learner_guardians
for select to authenticated, myschool_runtime
using (
  guardian_user_id = (select auth.uid())
  or exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_guardians.learner_profile_id
      and (lp.owner_user_id = (select auth.uid()) or lp.created_by_user_id = (select auth.uid()))
  )
);

drop policy if exists learner_school_memberships_read on public.learner_school_memberships;
create policy learner_school_memberships_read on public.learner_school_memberships
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_school_memberships.learner_profile_id
      and (lp.owner_user_id = (select auth.uid()) or lp.created_by_user_id = (select auth.uid()))
  )
  or exists (
    select 1 from public.learner_guardians g
    where g.learner_profile_id = learner_school_memberships.learner_profile_id
      and g.guardian_user_id = (select auth.uid())
      and g.link_status = 'active'
  )
  or app.has_permission('students.read', tenant_id, school_id, null)
);

drop policy if exists learner_subscriptions_read on public.learner_subscriptions;
create policy learner_subscriptions_read on public.learner_subscriptions
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_subscriptions.learner_profile_id
      and lp.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.learner_guardians g
    where g.learner_profile_id = learner_subscriptions.learner_profile_id
      and g.guardian_user_id = (select auth.uid())
      and g.link_status = 'active'
      and g.can_manage_payments
  )
);

drop policy if exists learner_entitlement_overrides_read on public.learner_entitlement_overrides;
create policy learner_entitlement_overrides_read on public.learner_entitlement_overrides
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_entitlement_overrides.learner_profile_id
      and lp.owner_user_id = (select auth.uid())
  )
  or app.has_permission('platform.tenants.manage', null, null, null)
);

drop policy if exists academy_videos_published_read on public.academy_videos;
create policy academy_videos_published_read on public.academy_videos
for select to authenticated, myschool_runtime
using (publication_status = 'published' and review_status = 'approved');

drop policy if exists learner_referral_codes_read on public.learner_referral_codes;
create policy learner_referral_codes_read on public.learner_referral_codes
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_referral_codes.learner_profile_id
      and lp.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.learner_guardians g
    where g.learner_profile_id = learner_referral_codes.learner_profile_id
      and g.guardian_user_id = (select auth.uid())
      and g.link_status = 'active'
  )
);

drop policy if exists learner_referral_attributions_read on public.learner_referral_attributions;
create policy learner_referral_attributions_read on public.learner_referral_attributions
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_referral_codes c
    join public.learner_profiles lp on lp.id = c.learner_profile_id
    where c.id = learner_referral_attributions.referral_code_id
      and lp.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_referral_attributions.referred_learner_profile_id
      and lp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists learner_reward_rules_read on public.learner_reward_rules;
create policy learner_reward_rules_read on public.learner_reward_rules
for select to authenticated, myschool_runtime
using (is_enabled = true and starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists learner_rewards_read on public.learner_rewards;
create policy learner_rewards_read on public.learner_rewards
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_rewards.learner_profile_id
      and lp.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.learner_guardians g
    where g.learner_profile_id = learner_rewards.learner_profile_id
      and g.guardian_user_id = (select auth.uid())
      and g.link_status = 'active'
  )
);

drop policy if exists learner_gems_ledger_read on public.learner_gems_ledger;
create policy learner_gems_ledger_read on public.learner_gems_ledger
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_gems_ledger.learner_profile_id
      and lp.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.learner_guardians g
    where g.learner_profile_id = learner_gems_ledger.learner_profile_id
      and g.guardian_user_id = (select auth.uid())
      and g.link_status = 'active'
      and g.can_manage_payments
  )
);

drop policy if exists learner_xp_events_read on public.learner_xp_events;
create policy learner_xp_events_read on public.learner_xp_events
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_xp_events.learner_profile_id
      and lp.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.learner_guardians g
    where g.learner_profile_id = learner_xp_events.learner_profile_id
      and g.guardian_user_id = (select auth.uid())
      and g.link_status = 'active'
      and g.can_view_progress
  )
);

drop policy if exists learning_competitions_read on public.learning_competitions;
create policy learning_competitions_read on public.learning_competitions
for select to authenticated, myschool_runtime
using (
  competition_status in ('scheduled', 'active', 'completed')
  and (
    competition_scope in ('platform', 'friends')
    or (competition_scope = 'tenant' and tenant_id = app.current_tenant_id())
    or (competition_scope in ('school', 'class') and tenant_id = app.current_tenant_id() and school_id = app.current_school_id())
  )
);

drop policy if exists learning_competition_entries_read on public.learning_competition_entries;
create policy learning_competition_entries_read on public.learning_competition_entries
for select to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.learner_profiles lp
    where lp.id = learning_competition_entries.learner_profile_id
      and lp.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.learning_competitions c
    where c.id = learning_competition_entries.competition_id
      and c.competition_scope in ('platform', 'school')
      and c.privacy_mode = 'public_opt_in'
      and learning_competition_entries.opted_into_leaderboard
  )
);

grant select on public.learner_profiles, public.learner_guardians,
  public.learner_school_memberships, public.learner_subscriptions,
  public.learner_entitlement_overrides, public.academy_videos,
  public.learner_referral_codes, public.learner_referral_attributions,
  public.learner_reward_rules, public.learner_rewards, public.learner_gems_ledger,
  public.learner_xp_events, public.learning_competitions,
  public.learning_competition_entries
to authenticated, myschool_runtime;

revoke all on function public.create_child_learner_profile(text, text, date, text) from public, anon;
revoke all on function public.create_own_learner_profile(text, text, date) from public, anon;
revoke all on function public.request_learner_school_membership(uuid, uuid) from public, anon;
revoke all on function public.review_learner_school_membership(uuid, text, text) from public, anon;
revoke all on function public.link_learner_school_roster_record(uuid, uuid) from public, anon;
revoke all on function public.resolve_learner_entitlements(uuid) from public, anon;
revoke all on function public.get_learner_gems_balance(uuid) from public, anon;
revoke all on function public.redeem_learner_gems(uuid, bigint, text, text, uuid, text) from public, anon;

grant execute on function public.create_child_learner_profile(text, text, date, text) to authenticated, myschool_runtime;
grant execute on function public.create_own_learner_profile(text, text, date) to authenticated, myschool_runtime;
grant execute on function public.request_learner_school_membership(uuid, uuid) to authenticated, myschool_runtime;
grant execute on function public.review_learner_school_membership(uuid, text, text) to authenticated, myschool_runtime;
grant execute on function public.link_learner_school_roster_record(uuid, uuid) to authenticated, myschool_runtime;
grant execute on function public.resolve_learner_entitlements(uuid) to authenticated, myschool_runtime;
grant execute on function public.get_learner_gems_balance(uuid) to authenticated, myschool_runtime;
grant execute on function public.redeem_learner_gems(uuid, bigint, text, text, uuid, text) to authenticated, myschool_runtime;

commit;
