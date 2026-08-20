-- Automation Runtime Phase 2B1.1 - hotel quiet-hours schema foundation
-- Manual migration only. Do not run before the Phase 2B1.1 preflight has been
-- reviewed in the target database.
--
-- This migration is additive and backward-compatible with current code:
-- existing runtime paths ignore the new hotel delivery-policy columns.

alter table public.hotels
add column if not exists automation_quiet_hours_enabled boolean not null default true;

alter table public.hotels
add column if not exists automation_quiet_hours_start time without time zone not null default time '22:00';

alter table public.hotels
add column if not exists automation_quiet_hours_end time without time zone not null default time '08:00';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotels_automation_quiet_hours_start_end_check'
      and conrelid = 'public.hotels'::regclass
  ) then
    alter table public.hotels
    add constraint hotels_automation_quiet_hours_start_end_check
    check (automation_quiet_hours_start <> automation_quiet_hours_end);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotels_automation_quiet_hours_start_minute_precision_check'
      and conrelid = 'public.hotels'::regclass
  ) then
    alter table public.hotels
    add constraint hotels_automation_quiet_hours_start_minute_precision_check
    check (extract(second from automation_quiet_hours_start) = 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotels_automation_quiet_hours_end_minute_precision_check'
      and conrelid = 'public.hotels'::regclass
  ) then
    alter table public.hotels
    add constraint hotels_automation_quiet_hours_end_minute_precision_check
    check (extract(second from automation_quiet_hours_end) = 0);
  end if;
end $$;
