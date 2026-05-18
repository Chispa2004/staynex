-- Staynex Partner Revenue Separation & Marketplace Layer
-- Controlled rollout: run manually in Supabase after review.
-- Separates hotel-owned revenue from Staynex Partner Network revenue.

alter table hotel_experience_providers
  add column if not exists revenue_owner text not null default 'staynex',
  add column if not exists revenue_type text not null default 'partner_marketplace',
  add column if not exists commission_model text not null default 'percent',
  add column if not exists staynex_commission_percent numeric null,
  add column if not exists staynex_commission_fixed numeric null,
  add column if not exists hotel_commission_percent numeric null,
  add column if not exists visible_to_hotel boolean not null default true,
  add column if not exists hotel_can_manage boolean not null default false,
  add column if not exists reception_action_required boolean not null default false;

alter table provider_experiences
  add column if not exists revenue_owner text not null default 'staynex',
  add column if not exists revenue_type text not null default 'partner_marketplace',
  add column if not exists platform_commission_percent numeric null,
  add column if not exists platform_commission_fixed numeric null,
  add column if not exists hotel_commission_percent numeric null,
  add column if not exists hotel_visible_revenue boolean not null default false;

alter table experience_booking_requests
  add column if not exists revenue_owner text not null default 'hotel',
  add column if not exists revenue_type text not null default 'hotel_service',
  add column if not exists hotel_visible_revenue boolean not null default true,
  add column if not exists platform_commission_amount numeric not null default 0,
  add column if not exists platform_commission_percent numeric null,
  add column if not exists provider_payout_amount numeric not null default 0,
  add column if not exists hotel_commission_amount numeric not null default 0,
  add column if not exists hotel_commission_percent numeric null,
  add column if not exists partner_id uuid null references experience_providers(id) on delete set null,
  add column if not exists partner_lead_email text null,
  add column if not exists attribution_source text not null default 'ai_concierge';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'experience_booking_requests_revenue_owner_check'
  ) then
    alter table experience_booking_requests
      add constraint experience_booking_requests_revenue_owner_check
      check (revenue_owner in ('hotel', 'staynex', 'shared'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'experience_booking_requests_revenue_type_check'
  ) then
    alter table experience_booking_requests
      add constraint experience_booking_requests_revenue_type_check
      check (revenue_type in ('hotel_service', 'partner_marketplace', 'affiliate', 'external_provider'));
  end if;
end $$;

create index if not exists idx_experience_booking_requests_revenue_owner
  on experience_booking_requests(revenue_owner);

create index if not exists idx_experience_booking_requests_revenue_type
  on experience_booking_requests(revenue_type);

create index if not exists idx_experience_booking_requests_partner
  on experience_booking_requests(partner_id);

-- Existing hotel-owned bookings remain hotel revenue.
update experience_booking_requests
set
  revenue_owner = 'hotel',
  revenue_type = 'hotel_service',
  hotel_visible_revenue = true,
  attribution_source = coalesce(source, 'ai_concierge')
where provider_id is null
  and coalesce(revenue_owner, 'hotel') = 'hotel';

-- Provider-led bookings are part of the Staynex Partner Network by default.
update experience_booking_requests
set
  revenue_owner = 'staynex',
  revenue_type = 'partner_marketplace',
  hotel_visible_revenue = false,
  partner_id = provider_id,
  partner_lead_email = provider_lead_email,
  attribution_source = coalesce(source, 'ai_concierge'),
  platform_commission_percent = coalesce(platform_commission_percent, nullif(commission_estimate, 0) * 100 / nullif(estimated_revenue, 0)),
  platform_commission_amount = coalesce(nullif(platform_commission_amount, 0), commission_estimate, 0),
  provider_payout_amount = greatest(coalesce(estimated_revenue, 0) - coalesce(nullif(platform_commission_amount, 0), commission_estimate, 0), 0),
  hotel_commission_amount = 0,
  hotel_commission_percent = 0
where provider_id is not null;

update hotel_experience_providers
set
  revenue_owner = coalesce(revenue_owner, 'staynex'),
  revenue_type = coalesce(revenue_type, 'partner_marketplace'),
  visible_to_hotel = coalesce(visible_to_hotel, true),
  hotel_can_manage = coalesce(hotel_can_manage, false),
  reception_action_required = coalesce(reception_action_required, false);

update provider_experiences
set
  revenue_owner = coalesce(revenue_owner, 'staynex'),
  revenue_type = coalesce(revenue_type, 'partner_marketplace'),
  platform_commission_percent = coalesce(platform_commission_percent, commission_percent),
  hotel_commission_percent = coalesce(hotel_commission_percent, 0),
  hotel_visible_revenue = coalesce(hotel_visible_revenue, false);

-- Luxotour default commercial model.
update hotel_experience_providers hep
set
  revenue_owner = 'staynex',
  revenue_type = 'partner_marketplace',
  commission_model = 'percent',
  staynex_commission_percent = coalesce(hepx.staynex_commission_percent, 10),
  staynex_commission_fixed = null,
  hotel_commission_percent = 0,
  visible_to_hotel = true,
  hotel_can_manage = false,
  reception_action_required = false
from hotel_experience_providers hepx
join experience_providers ep on ep.id = hepx.provider_id
where hep.id = hepx.id
  and ep.slug = 'luxotour-morocco';

comment on column experience_booking_requests.revenue_owner is
  'Revenue owner: hotel, staynex, or shared.';

comment on column experience_booking_requests.revenue_type is
  'Revenue type: hotel_service, partner_marketplace, affiliate, or external_provider.';

comment on column experience_booking_requests.hotel_visible_revenue is
  'Controls whether hotel dashboard may display booking revenue/commission.';
