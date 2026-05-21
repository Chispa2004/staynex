-- Staynex Failure Intelligence.
-- Internal-only AI QA history for Simulation Mode runs.

alter table hotel_users
  add column if not exists platform_role text not null default 'none';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'hotel_users_platform_role_check'
  ) then
    alter table hotel_users
      drop constraint hotel_users_platform_role_check;
  end if;

  alter table hotel_users
    add constraint hotel_users_platform_role_check
    check (platform_role in ('super_admin', 'platform_admin', 'internal_only', 'support', 'none'));
end $$;

create table if not exists ai_quality_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  ai_version text null,
  filters jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  success_rate numeric null,
  unsafe_count integer not null default 0,
  repeated_responses integer not null default 0,
  top_failures jsonb not null default '[]'::jsonb,
  created_by uuid null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists failure_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid null references ai_quality_simulation_runs(id) on delete cascade,
  result_id text null,
  scenario text null,
  language text null,
  guest_type text null,
  hotel_type text null,
  intent text null,
  categories text[] not null default '{}'::text[],
  severity text null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  unsafe_reason text null,
  requires_manual_review boolean not null default false,
  confidence numeric null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_quality_simulation_runs_run_at_idx
  on ai_quality_simulation_runs (run_at desc);

create index if not exists failure_intelligence_events_run_id_idx
  on failure_intelligence_events (run_id);

create index if not exists failure_intelligence_events_severity_idx
  on failure_intelligence_events (severity);

create index if not exists failure_intelligence_events_categories_idx
  on failure_intelligence_events using gin (categories);

alter table ai_quality_simulation_runs enable row level security;
alter table failure_intelligence_events enable row level security;

drop policy if exists "Platform admins can read AI quality runs" on ai_quality_simulation_runs;
create policy "Platform admins can read AI quality runs"
  on ai_quality_simulation_runs
  for select
  using (
    exists (
      select 1
      from hotel_users hu
      where hu.user_id = auth.uid()
        and coalesce(hu.platform_role, 'none') in ('super_admin', 'platform_admin', 'internal_only')
    )
  );

drop policy if exists "Platform admins can manage AI quality runs" on ai_quality_simulation_runs;
create policy "Platform admins can manage AI quality runs"
  on ai_quality_simulation_runs
  for all
  using (
    exists (
      select 1
      from hotel_users hu
      where hu.user_id = auth.uid()
        and coalesce(hu.platform_role, 'none') in ('super_admin', 'platform_admin', 'internal_only')
    )
  )
  with check (
    exists (
      select 1
      from hotel_users hu
      where hu.user_id = auth.uid()
        and coalesce(hu.platform_role, 'none') in ('super_admin', 'platform_admin', 'internal_only')
    )
  );

drop policy if exists "Platform admins can read failure events" on failure_intelligence_events;
create policy "Platform admins can read failure events"
  on failure_intelligence_events
  for select
  using (
    exists (
      select 1
      from hotel_users hu
      where hu.user_id = auth.uid()
        and coalesce(hu.platform_role, 'none') in ('super_admin', 'platform_admin', 'internal_only')
    )
  );

drop policy if exists "Platform admins can manage failure events" on failure_intelligence_events;
create policy "Platform admins can manage failure events"
  on failure_intelligence_events
  for all
  using (
    exists (
      select 1
      from hotel_users hu
      where hu.user_id = auth.uid()
        and coalesce(hu.platform_role, 'none') in ('super_admin', 'platform_admin', 'internal_only')
    )
  )
  with check (
    exists (
      select 1
      from hotel_users hu
      where hu.user_id = auth.uid()
        and coalesce(hu.platform_role, 'none') in ('super_admin', 'platform_admin', 'internal_only')
    )
  );
