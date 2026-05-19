-- Staynex Intelligent Automations Engine
-- Manual rollout only. Safe to run after existing automation_rules / scheduled_messages migrations.

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name text not null,
  type text not null,
  trigger_type text not null,
  active boolean not null default true,
  audience_type text not null default 'all_guests',
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  cooldown_minutes integer not null default 1440,
  max_per_guest integer not null default 1,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists automations_hotel_type_unique
on public.automations (hotel_id, type);

create index if not exists automations_hotel_id_idx
on public.automations (hotel_id);

create index if not exists automations_active_idx
on public.automations (active);

create index if not exists automations_trigger_type_idx
on public.automations (trigger_type);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid null references public.automations(id) on delete set null,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid null references public.guests(id) on delete set null,
  reservation_id uuid null references public.reservations(id) on delete set null,
  conversation_id uuid null references public.conversations(id) on delete set null,
  trigger_type text not null,
  automation_type text not null,
  message_sent boolean not null default false,
  translated_language text null,
  opened boolean not null default false,
  replied boolean not null default false,
  converted boolean not null default false,
  revenue_generated numeric null default 0,
  revenue_owner text null default 'hotel',
  provider_id uuid null,
  scheduled_message_id uuid null references public.scheduled_messages(id) on delete set null,
  status text not null default 'scheduled',
  cooldown_applied boolean not null default false,
  fatigue_score numeric null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_runs_hotel_id_idx
on public.automation_runs (hotel_id);

create index if not exists automation_runs_automation_id_idx
on public.automation_runs (automation_id);

create index if not exists automation_runs_guest_id_idx
on public.automation_runs (guest_id);

create index if not exists automation_runs_type_created_idx
on public.automation_runs (automation_type, created_at desc);

create index if not exists automation_runs_status_idx
on public.automation_runs (status);

-- automation_events existed before this engine for reservation lifecycle events.
-- Extend it in-place so PMS workflows keep working.
alter table public.automation_events
add column if not exists hotel_id uuid null references public.hotels(id) on delete cascade;

alter table public.automation_events
add column if not exists automation_id uuid null references public.automations(id) on delete set null;

alter table public.automation_events
add column if not exists automation_run_id uuid null references public.automation_runs(id) on delete set null;

alter table public.automation_events
add column if not exists guest_id uuid null references public.guests(id) on delete set null;

alter table public.automation_events
add column if not exists conversation_id uuid null references public.conversations(id) on delete set null;

alter table public.automation_events
add column if not exists trigger_type text null;

alter table public.automation_events
add column if not exists event_name text null;

alter table public.automation_events
add column if not exists revenue_generated numeric null default 0;

alter table public.automation_events
add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.automation_events
add column if not exists updated_at timestamptz not null default now();

create index if not exists automation_events_hotel_id_idx
on public.automation_events (hotel_id);

create index if not exists automation_events_automation_id_idx
on public.automation_events (automation_id);

create index if not exists automation_events_run_id_idx
on public.automation_events (automation_run_id);

create index if not exists automation_events_trigger_type_idx
on public.automation_events (trigger_type);

-- Optional analytics columns on scheduled_messages for automation center attribution.
alter table public.scheduled_messages
add column if not exists automation_run_id uuid null references public.automation_runs(id) on delete set null;

alter table public.scheduled_messages
add column if not exists estimated_revenue numeric null default 0;

alter table public.scheduled_messages
add column if not exists revenue_owner text null default 'hotel';

alter table public.scheduled_messages
add column if not exists cooldown_applied boolean not null default false;

alter table public.scheduled_messages
add column if not exists fatigue_score numeric null default 0;

create index if not exists scheduled_messages_automation_run_id_idx
on public.scheduled_messages (automation_run_id);

comment on table public.automations is
  'Hotel-scoped proactive automation definitions for the Staynex Intelligent Automations Engine.';

comment on table public.automation_runs is
  'Execution and revenue attribution log for proactive automation decisions.';

comment on table public.automation_events is
  'Automation lifecycle events, extended for intelligent automation analytics.';

-- Safe tenant policies if RLS Phase 1/2 helper functions have already been installed.
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_events enable row level security;

do $$
begin
  if to_regprocedure('public.staynex_can_read_hotel(uuid)') is not null
    and to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') is not null
    and to_regprocedure('public.staynex_can_manage_hotel(uuid)') is not null
  then
    execute 'drop policy if exists staynex_tenant_read_automations on public.automations';
    execute 'create policy staynex_tenant_read_automations on public.automations for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';

    execute 'drop policy if exists staynex_tenant_write_automations on public.automations';
    execute 'create policy staynex_tenant_write_automations on public.automations for all to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[]))';

    execute 'drop policy if exists staynex_tenant_read_automation_runs on public.automation_runs';
    execute 'create policy staynex_tenant_read_automation_runs on public.automation_runs for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';

    execute 'drop policy if exists staynex_tenant_write_automation_runs on public.automation_runs';
    execute 'create policy staynex_tenant_write_automation_runs on public.automation_runs for all to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[]))';

    execute 'drop policy if exists staynex_tenant_read_automation_events on public.automation_events';
    execute 'create policy staynex_tenant_read_automation_events on public.automation_events for select to authenticated using (hotel_id is null or public.staynex_can_read_hotel(hotel_id))';

    execute 'drop policy if exists staynex_tenant_write_automation_events on public.automation_events';
    execute 'create policy staynex_tenant_write_automation_events on public.automation_events for all to authenticated using (hotel_id is null or public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[])) with check (hotel_id is null or public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[]))';

    execute 'grant select, insert, update, delete on public.automations to authenticated';
    execute 'grant select, insert, update, delete on public.automation_runs to authenticated';
    execute 'grant select, insert, update, delete on public.automation_events to authenticated';
  else
    raise notice 'Automation engine RLS helper functions not found. Run RLS Phase 1/2 before exposing direct authenticated table access. Backend service_role APIs remain tenant-scoped.';
  end if;
end $$;
