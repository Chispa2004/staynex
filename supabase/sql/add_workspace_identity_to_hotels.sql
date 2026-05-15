-- Workspace identity fields for multi-hotel Staynex workspaces.
-- Safe to run more than once.

alter table hotels
  add column if not exists logo_url text null,
  add column if not exists brand_color text null,
  add column if not exists secondary_color text null,
  add column if not exists favicon_url text null,
  add column if not exists workspace_slug text null,
  add column if not exists support_email text null,
  add column if not exists support_phone text null,
  add column if not exists custom_domain text null,
  add column if not exists subscription_plan text null;

update hotels
set workspace_slug = coalesce(workspace_slug, slug)
where workspace_slug is null;

create unique index if not exists hotels_workspace_slug_unique
  on hotels (workspace_slug)
  where workspace_slug is not null;

create index if not exists hotels_custom_domain_idx
  on hotels (custom_domain)
  where custom_domain is not null;

insert into hotels (
  name,
  brand_name,
  slug,
  workspace_slug,
  address,
  phone,
  whatsapp_number,
  timezone,
  default_language,
  check_in_time,
  check_out_time,
  description,
  brand_color,
  secondary_color,
  support_email,
  support_phone,
  subscription_plan
)
values
  (
    'Hotel Riu Mallorca',
    'RIU',
    'hotel-riu-mallorca',
    'riu-mallorca',
    'Playa de Palma, Mallorca',
    '+34 971 000 001',
    '+14155238886',
    'Europe/Madrid',
    'es',
    '15:00',
    '12:00',
    'Workspace demo premium para operaciones IA de resort vacacional.',
    '#10b981',
    '#0f766e',
    'ops@riu-mallorca.demo',
    '+34 971 000 001',
    'enterprise_demo'
  ),
  (
    'Melia Ibiza',
    'Melia',
    'melia-ibiza',
    'melia-ibiza',
    'Santa Eularia, Ibiza',
    '+34 971 000 002',
    '+14155238886',
    'Europe/Madrid',
    'es',
    '15:00',
    '12:00',
    'Workspace demo para hotel lifestyle con revenue y concierge IA.',
    '#38bdf8',
    '#2563eb',
    'ops@melia-ibiza.demo',
    '+34 971 000 002',
    'enterprise_demo'
  ),
  (
    'Boutique Palma Suites',
    'Palma Suites',
    'boutique-palma-suites',
    'boutique-palma-suites',
    'Palma, Mallorca',
    '+34 971 000 003',
    '+14155238886',
    'Europe/Madrid',
    'es',
    '14:00',
    '11:00',
    'Workspace demo boutique para atención personalizada y memoria huésped.',
    '#f59e0b',
    '#b45309',
    'ops@palma-suites.demo',
    '+34 971 000 003',
    'pro_demo'
  )
on conflict (slug) do update
set
  workspace_slug = coalesce(hotels.workspace_slug, excluded.workspace_slug),
  brand_color = coalesce(hotels.brand_color, excluded.brand_color),
  secondary_color = coalesce(hotels.secondary_color, excluded.secondary_color),
  support_email = coalesce(hotels.support_email, excluded.support_email),
  support_phone = coalesce(hotels.support_phone, excluded.support_phone),
  subscription_plan = coalesce(hotels.subscription_plan, excluded.subscription_plan),
  updated_at = now();
