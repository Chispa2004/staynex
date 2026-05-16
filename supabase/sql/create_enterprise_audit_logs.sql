-- Staynex Enterprise Audit Logs
--
-- Purpose:
-- - Record security-relevant operational actions across hotel workspaces.
-- - Support future compliance, support-mode traceability and tenant security reviews.
-- - Keep writes backend/service_role driven for now; no browser write policy is added here.
--
-- Recommended event names:
-- - ticket_updated
-- - experience_booking_confirmed
-- - experience_booking_rejected
-- - experience_created
-- - local_knowledge_updated
-- - support_session_started
-- - workspace_switch
-- - onboarding_completed
-- - pms_settings_changed

begin;

create table if not exists public.enterprise_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  actor_email text null,
  actor_role text null,
  actor_platform_role text null default 'none',
  hotel_id uuid null references public.hotels(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  old_values_summary jsonb default '{}'::jsonb,
  new_values_summary jsonb default '{}'::jsonb,
  ip_address inet null,
  user_agent text null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists enterprise_audit_logs_hotel_id_idx on public.enterprise_audit_logs(hotel_id);
create index if not exists enterprise_audit_logs_actor_user_id_idx on public.enterprise_audit_logs(actor_user_id);
create index if not exists enterprise_audit_logs_actor_email_idx on public.enterprise_audit_logs(lower(actor_email));
create index if not exists enterprise_audit_logs_action_idx on public.enterprise_audit_logs(action);
create index if not exists enterprise_audit_logs_entity_idx on public.enterprise_audit_logs(entity_type, entity_id);
create index if not exists enterprise_audit_logs_created_at_idx on public.enterprise_audit_logs(created_at desc);

alter table public.enterprise_audit_logs enable row level security;

-- Phase 2 keeps enterprise audit writes backend-driven through service_role.
-- Authenticated users receive no INSERT/UPDATE/DELETE policies here.
-- A read policy can be added later once the product UI for audit review is finalized.

comment on table public.enterprise_audit_logs is
  'Enterprise audit trail for tenant operations, support access and security-relevant workspace events. Written by backend/service_role in Phase 2.';

commit;
