-- Staynex GDPR retention settings and audit trail.
-- Review and run manually in Supabase. This migration is intentionally additive.

alter table public.hotels
  add column if not exists guest_data_retention_days integer not null default 30,
  add column if not exists anonymize_after_checkout_days integer not null default 30,
  add column if not exists delete_message_body_after_days integer not null default 90,
  add column if not exists retain_analytics_only boolean not null default true,
  add column if not exists last_data_retention_cleanup_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hotels_guest_data_retention_days_positive'
  ) then
    alter table public.hotels
      add constraint hotels_guest_data_retention_days_positive
      check (guest_data_retention_days between 1 and 3650) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'hotels_anonymize_after_checkout_days_positive'
  ) then
    alter table public.hotels
      add constraint hotels_anonymize_after_checkout_days_positive
      check (anonymize_after_checkout_days between 1 and 3650) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'hotels_delete_message_body_after_days_positive'
  ) then
    alter table public.hotels
      add constraint hotels_delete_message_body_after_days_positive
      check (delete_message_body_after_days between 1 and 3650) not valid;
  end if;
end $$;

create table if not exists public.data_retention_audit_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid null references public.hotels(id) on delete set null,
  job_name text not null,
  run_at timestamptz not null default now(),
  records_scanned integer not null default 0,
  records_anonymized integer not null default 0,
  records_deleted integer not null default 0,
  status text not null default 'success',
  error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists data_retention_audit_logs_hotel_run_idx
  on public.data_retention_audit_logs (hotel_id, run_at desc);

create index if not exists data_retention_audit_logs_job_run_idx
  on public.data_retention_audit_logs (job_name, run_at desc);

create index if not exists reservations_hotel_departure_idx
  on public.reservations (hotel_id, departure_date);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

comment on column public.hotels.guest_data_retention_days is
  'Default hotel retention policy window for personally identifiable guest data.';

comment on column public.hotels.anonymize_after_checkout_days is
  'Days after checkout before Staynex jobs anonymize guest identifiers.';

comment on column public.hotels.delete_message_body_after_days is
  'Days before message bodies may be anonymized while preserving aggregate analytics.';

comment on column public.hotels.retain_analytics_only is
  'When true, retention jobs preserve operational counts/revenue and strip personal content.';

comment on table public.data_retention_audit_logs is
  'Audit trail for GDPR retention dry-runs and anonymization jobs.';
