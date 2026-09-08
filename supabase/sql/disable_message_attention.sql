-- Recovery only, with operator authorization. Preserves attention and all audit evidence.
-- Disable the UI/RPC contract and inclusion of future inserts together. Inbound remains available.
begin;
alter table public.messages alter column attention_inclusion_version drop default;
commit;
-- Existing inclusion values, explicit states and audit are unchanged. No trigger is used.
-- Messages arriving while disabled have NULL inclusion and remain untracked after reactivation.
-- Re-enable after review: ALTER TABLE public.messages ALTER COLUMN attention_inclusion_version SET DEFAULT 1;
