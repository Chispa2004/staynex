alter table public.guests
add column if not exists preferred_language text not null default 'es';

update public.guests
set preferred_language = 'es'
where preferred_language is null;
