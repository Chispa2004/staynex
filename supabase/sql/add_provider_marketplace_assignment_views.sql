-- Staynex Platform / Hotel / Provider separation helpers
-- Run after create_experience_providers.sql.
-- These views keep the existing source of truth while exposing clearer names
-- for platform reporting and future BI integrations.

alter table public.hotel_experience_providers
  add column if not exists revenue_owner text not null default 'staynex',
  add column if not exists revenue_type text not null default 'partner_marketplace',
  add column if not exists commission_model text not null default 'percent',
  add column if not exists staynex_commission_percent numeric null,
  add column if not exists staynex_commission_fixed numeric null,
  add column if not exists hotel_commission_percent numeric null,
  add column if not exists visible_to_hotel boolean not null default true,
  add column if not exists hotel_can_manage boolean not null default false,
  add column if not exists reception_action_required boolean not null default false;

alter table public.provider_experiences
  add column if not exists revenue_owner text not null default 'staynex',
  add column if not exists revenue_type text not null default 'partner_marketplace',
  add column if not exists platform_commission_percent numeric null,
  add column if not exists platform_commission_fixed numeric null,
  add column if not exists hotel_commission_percent numeric null,
  add column if not exists hotel_visible_revenue boolean not null default false;

create or replace view public.hotel_provider_assignments as
select
  hep.id,
  hep.hotel_id,
  hep.provider_id,
  hep.priority,
  hep.active,
  hep.lead_email,
  hep.notes,
  hep.created_at,
  hep.updated_at,
  hep.revenue_owner,
  hep.revenue_type,
  hep.commission_model,
  hep.staynex_commission_percent,
  hep.staynex_commission_fixed,
  hep.hotel_commission_percent,
  hep.visible_to_hotel,
  hep.hotel_can_manage,
  hep.reception_action_required
from public.hotel_experience_providers hep;

create or replace view public.hotel_experience_assignments as
select
  hep.id as hotel_provider_assignment_id,
  hep.hotel_id,
  hep.provider_id,
  pe.id as provider_experience_id,
  pe.title,
  pe.slug,
  pe.category,
  pe.active as provider_experience_active,
  hep.active as hotel_provider_active,
  (pe.active is not false and hep.active is not false) as active_for_hotel,
  coalesce(pe.revenue_owner, hep.revenue_owner, 'staynex') as revenue_owner,
  coalesce(pe.revenue_type, hep.revenue_type, 'partner_marketplace') as revenue_type,
  coalesce(pe.platform_commission_percent, hep.staynex_commission_percent) as staynex_commission_percent,
  coalesce(pe.hotel_commission_percent, hep.hotel_commission_percent, 0) as hotel_commission_percent,
  coalesce(pe.hotel_visible_revenue, false) as hotel_visible_revenue,
  hep.lead_email,
  pe.metadata,
  pe.updated_at
from public.hotel_experience_providers hep
join public.provider_experiences pe on pe.provider_id = hep.provider_id;

comment on view public.hotel_provider_assignments is
  'Platform-facing alias for hotel_experience_providers. Source of truth remains hotel_experience_providers.';

comment on view public.hotel_experience_assignments is
  'Resolved hotel-to-provider-experience scope used by platform reporting and future BI exports.';

notify pgrst, 'reload schema';
