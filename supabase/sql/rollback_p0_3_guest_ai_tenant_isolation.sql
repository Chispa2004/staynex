-- BADAR P0-3 rollback.
-- Security rollback is intentionally closed: it keeps RLS enabled, keeps browser
-- roles revoked, and does not delete or backfill data. Relationship indexes and
-- constraints are retained unless manually reviewed in production.

begin;

alter table public.guests enable row level security;
alter table public.guest_ai_profiles enable row level security;
alter table public.guest_ai_tags enable row level security;
alter table public.guest_ai_insights enable row level security;
alter table public.guest_ai_actions enable row level security;
alter table public.ai_logs enable row level security;
alter table public.conversation_ai_state enable row level security;
alter table public.scheduled_messages enable row level security;

revoke all privileges on table public.guests from public;
revoke all privileges on table public.guests from anon;
revoke all privileges on table public.guests from authenticated;

revoke all privileges on table public.guest_ai_profiles from public;
revoke all privileges on table public.guest_ai_profiles from anon;
revoke all privileges on table public.guest_ai_profiles from authenticated;

revoke all privileges on table public.guest_ai_tags from public;
revoke all privileges on table public.guest_ai_tags from anon;
revoke all privileges on table public.guest_ai_tags from authenticated;

revoke all privileges on table public.guest_ai_insights from public;
revoke all privileges on table public.guest_ai_insights from anon;
revoke all privileges on table public.guest_ai_insights from authenticated;

revoke all privileges on table public.guest_ai_actions from public;
revoke all privileges on table public.guest_ai_actions from anon;
revoke all privileges on table public.guest_ai_actions from authenticated;

revoke all privileges on table public.ai_logs from public;
revoke all privileges on table public.ai_logs from anon;
revoke all privileges on table public.ai_logs from authenticated;

revoke all privileges on table public.conversation_ai_state from public;
revoke all privileges on table public.conversation_ai_state from anon;
revoke all privileges on table public.conversation_ai_state from authenticated;

revoke all privileges on table public.scheduled_messages from public;
revoke all privileges on table public.scheduled_messages from anon;
revoke all privileges on table public.scheduled_messages from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.guests to service_role;
    grant select, insert, update, delete on table public.guest_ai_profiles to service_role;
    grant select, insert, update, delete on table public.guest_ai_tags to service_role;
    grant select, insert, update, delete on table public.guest_ai_insights to service_role;
    grant select, insert, update, delete on table public.guest_ai_actions to service_role;
    grant select, insert, update, delete on table public.ai_logs to service_role;
    grant select, insert, update, delete on table public.conversation_ai_state to service_role;
    grant select, insert, update, delete on table public.scheduled_messages to service_role;
  end if;
end $$;

commit;
