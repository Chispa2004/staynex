create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  actor_email text null,
  actor_platform_role text null,
  action text not null,
  hotel_id uuid null references public.hotels(id) on delete set null,
  target_user_id uuid null,
  target_email text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_logs_action_idx
on public.platform_audit_logs (action);

create index if not exists platform_audit_logs_hotel_id_idx
on public.platform_audit_logs (hotel_id);

create index if not exists platform_audit_logs_actor_user_id_idx
on public.platform_audit_logs (actor_user_id);

create index if not exists platform_audit_logs_created_at_idx
on public.platform_audit_logs (created_at desc);

comment on table public.platform_audit_logs is 'Internal Staynex platform operations audit trail for workspace creation, support access, user changes and future billing/PMS admin events.';
