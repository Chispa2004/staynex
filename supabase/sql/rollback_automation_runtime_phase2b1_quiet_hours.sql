-- Automation Runtime Phase 2B1.1 quiet-hours rollback
-- Manual use only. Removes only the additive hotel quiet-hours foundation.

begin;

alter table if exists public.hotels
drop constraint if exists hotels_automation_quiet_hours_start_end_check;

alter table if exists public.hotels
drop constraint if exists hotels_automation_quiet_hours_start_minute_precision_check;

alter table if exists public.hotels
drop constraint if exists hotels_automation_quiet_hours_end_minute_precision_check;

alter table if exists public.hotels
drop column if exists automation_quiet_hours_enabled,
drop column if exists automation_quiet_hours_start,
drop column if exists automation_quiet_hours_end;

commit;
