-- BADAR P0-2A Stage B rollback.
-- Normal Stage B rollout:
--   code deploy -> production smoke -> Stage B preflight -> DB drop.
--
-- Rollback after DB drop:
--   1. Run this rollback first to re-add webhook_secret as nullable text.
--   2. Roll back application code only after the nullable legacy column exists.
--
-- This rollback cannot reconstruct historical plaintext values. The production
-- Stage B basis is the dry-run that found zero legacy plaintext values.

begin;

do $$
declare
  rollback_confirmed text;
begin
  rollback_confirmed := current_setting('badar.stage_b_db_rollback_confirmed', true);

  if rollback_confirmed is distinct from 'true' then
    raise exception 'Refusing Stage B DB rollback until explicitly confirmed. Set badar.stage_b_db_rollback_confirmed = true in this session before rollback.';
  end if;

  if to_regclass('public.hotel_pms_connections') is null then
    raise exception 'Refusing Stage B DB rollback because public.hotel_pms_connections is missing.';
  end if;
end $$;

alter table public.hotel_pms_connections
  add column if not exists webhook_secret text null;

commit;
