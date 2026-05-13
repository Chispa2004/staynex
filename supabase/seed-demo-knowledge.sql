with demo_hotel as (
  select id
  from hotels
  where name = 'Staynex Demo Hotel'
  order by created_at
  limit 1
),
entries(key, value) as (
  values
    ('desayuno', 'El desayuno es de 07:30 a 10:30.'),
    ('wifi', 'La red WiFi es StaynexGuest y la contraseña es staynex2026.'),
    ('checkout', 'El checkout es a las 12:00.'),
    ('piscina', 'La piscina abre de 10:00 a 19:00.'),
    ('spa', 'El spa abre de 10:00 a 20:00.'),
    ('parking', 'El parking cuesta 18€/día.'),
    ('room service', 'El room service está disponible de 12:00 a 23:00.'),
    ('restaurante', 'El restaurante sirve cenas de 19:30 a 23:00.')
)
insert into hotel_knowledge (hotel_id, key, value)
select demo_hotel.id, entries.key, entries.value
from demo_hotel
cross join entries
where not exists (
  select 1
  from hotel_knowledge
  where hotel_knowledge.hotel_id = demo_hotel.id
    and lower(hotel_knowledge.key) = lower(entries.key)
);
