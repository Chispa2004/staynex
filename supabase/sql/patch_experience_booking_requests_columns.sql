-- Patch production schemas where experience_booking_requests exists but newer
-- provider booking columns/statuses are missing from older deployments.

alter table public.experience_booking_requests
  add column if not exists provider_id uuid null references public.experience_providers(id) on delete set null,
  add column if not exists provider_experience_id uuid null references public.provider_experiences(id) on delete set null,
  add column if not exists provider_source text null,
  add column if not exists provider_lead_email text null,
  add column if not exists lead_status text null default 'not_required',
  add column if not exists lead_email_payload jsonb null,
  add column if not exists lead_email_sent_at timestamptz null,
  add column if not exists lead_error text null,
  add column if not exists revenue_owner text not null default 'hotel',
  add column if not exists revenue_type text not null default 'hotel_service',
  add column if not exists hotel_visible_revenue boolean not null default true,
  add column if not exists platform_commission_amount numeric not null default 0,
  add column if not exists platform_commission_percent numeric null,
  add column if not exists provider_payout_amount numeric not null default 0,
  add column if not exists hotel_commission_amount numeric not null default 0,
  add column if not exists hotel_commission_percent numeric null,
  add column if not exists partner_id uuid null references public.experience_providers(id) on delete set null,
  add column if not exists partner_lead_email text null,
  add column if not exists attribution_source text not null default 'ai_concierge';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'experience_booking_requests_status_check'
      and conrelid = 'public.experience_booking_requests'::regclass
  ) then
    alter table public.experience_booking_requests
      drop constraint experience_booking_requests_status_check;
  end if;

  alter table public.experience_booking_requests
    add constraint experience_booking_requests_status_check
    check (status in (
      'pending',
      'reviewing',
      'guest_interested',
      'awaiting_guest_details',
      'awaiting_guest_confirmation',
      'provider_request_sent',
      'provider_confirmed',
      'provider_rejected',
      'failed_provider_email',
      'confirmed',
      'rejected',
      'completed',
      'cancelled',
      'cancelled_by_guest'
    ));

  if not exists (
    select 1
    from pg_constraint
    where conname = 'experience_booking_requests_revenue_owner_check'
      and conrelid = 'public.experience_booking_requests'::regclass
  ) then
    alter table public.experience_booking_requests
      add constraint experience_booking_requests_revenue_owner_check
      check (revenue_owner in ('hotel', 'staynex', 'shared'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'experience_booking_requests_revenue_type_check'
      and conrelid = 'public.experience_booking_requests'::regclass
  ) then
    alter table public.experience_booking_requests
      add constraint experience_booking_requests_revenue_type_check
      check (revenue_type in ('hotel_service', 'partner_marketplace', 'affiliate', 'external_provider'));
  end if;
end $$;

create index if not exists idx_experience_booking_requests_provider
  on public.experience_booking_requests(provider_id);

create index if not exists idx_experience_booking_requests_provider_source
  on public.experience_booking_requests(provider_source);

create index if not exists idx_experience_booking_requests_lead_status
  on public.experience_booking_requests(lead_status);

create index if not exists idx_experience_booking_requests_revenue_owner
  on public.experience_booking_requests(revenue_owner);

create index if not exists idx_experience_booking_requests_revenue_type
  on public.experience_booking_requests(revenue_type);

create index if not exists idx_experience_booking_requests_partner
  on public.experience_booking_requests(partner_id);

notify pgrst, 'reload schema';
