-- Apply after add_hotel_access_invitations.sql, with affected consumers gated
-- and admitted transactions drained. No backfill, role promotion or data edits.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.hotel_access_invitations') IS NULL
 OR to_regprocedure('public.accept_hotel_invitation_v1(uuid,text,boolean)') IS NULL THEN
  RAISE EXCEPTION 'Explicit invitation contract required';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.hotel_explicit_invitation_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.user_id IS NOT NULL AND
   (OLD.user_id IS DISTINCT FROM NEW.user_id OR (OLD.status='invited' AND NEW.status='active')) THEN
   IF OLD.user_id IS NOT NULL OR OLD.status<>'invited' OR NEW.status<>'active'
     OR NOT EXISTS (
       SELECT 1 FROM public.hotel_access_invitations i
       JOIN auth.users a ON a.id=i.accepted_by
       WHERE i.assignment_id=NEW.id AND i.hotel_id=NEW.hotel_id
         AND i.accepted_by=NEW.user_id AND i.accepted_at IS NOT NULL
         AND i.accepted_at=NEW.accepted_at AND i.accepted_at<i.expires_at AND i.revoked_at IS NULL
         AND i.email=lower(btrim(NEW.email)) AND i.email=lower(btrim(a.email))
         AND i.role=NEW.role AND coalesce(NEW.platform_role,'none')='none'
         AND a.email_confirmed_at IS NOT NULL AND (a.banned_until IS NULL OR a.banned_until<now())
     ) THEN RAISE EXCEPTION 'Explicit invitation acceptance required' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hotel_explicit_invitation_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
-- Acceptance updates assignment and receipt in the same transaction. Check at
-- commit, never require an unsafe intermediate bypass or session flag.
DROP TRIGGER IF EXISTS hotel_explicit_invitation_guard_v1 ON public.hotel_users;
CREATE CONSTRAINT TRIGGER hotel_explicit_invitation_guard_v1
AFTER UPDATE ON public.hotel_users DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.hotel_explicit_invitation_guard_v1();
NOTIFY pgrst,'reload schema';
COMMIT;
