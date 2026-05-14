-- Hotel-scoped Knowledge Base.
-- Run after create_hotels_and_hotel_users.sql so the demo hotel slug exists.

alter table public.hotel_knowledge
add column if not exists hotel_id uuid references public.hotels(id) on delete cascade;

alter table public.hotel_knowledge
add column if not exists title text null;

alter table public.hotel_knowledge
add column if not exists category text null;

alter table public.hotel_knowledge
add column if not exists is_active boolean default true;

alter table public.hotel_knowledge
add column if not exists updated_at timestamptz default now();

update public.hotel_knowledge
set hotel_id = (
  select id
  from public.hotels
  where slug = 'staynex-demo'
  order by created_at asc
  limit 1
)
where hotel_id is null;

update public.hotel_knowledge
set
  title = coalesce(title, key),
  category = coalesce(category, key),
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, now());

create index if not exists hotel_knowledge_hotel_id_idx
on public.hotel_knowledge (hotel_id);

create index if not exists hotel_knowledge_category_idx
on public.hotel_knowledge (category);

create index if not exists hotel_knowledge_active_idx
on public.hotel_knowledge (is_active);

create index if not exists hotel_knowledge_hotel_active_idx
on public.hotel_knowledge (hotel_id, is_active);

alter table public.ai_logs
add column if not exists knowledge_hotel_id uuid references public.hotels(id) on delete set null;
