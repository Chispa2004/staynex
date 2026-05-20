-- The archive/delete flow must not clear whatsapp_number. This migration is
-- intentionally conservative: it only relaxes the constraint for legacy/demo
-- workspaces where a WhatsApp number may not exist yet.
alter table hotels
  alter column whatsapp_number drop not null;
