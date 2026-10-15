-- Apply before invitation consumers. Does not accept historical assignments.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hotel_access_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id uuid NOT NULL REFERENCES public.hotel_users(id),
 hotel_id uuid NOT NULL REFERENCES public.hotels(id),
 email text NOT NULL, role text NOT NULL CHECK(role IN ('admin','receptionist')),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz, accepted_at timestamptz, accepted_by uuid
);
CREATE INDEX IF NOT EXISTS hotel_access_invitations_assignment ON public.hotel_access_invitations(assignment_id);
ALTER TABLE public.hotel_access_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_access_invitations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.hotel_access_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.manage_hotel_invitation_v1(p_actor uuid,p_hotel uuid,p_assignment uuid,p_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE h jsonb; u public.hotel_users; i public.hotel_access_invitations;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hotel_users a JOIN auth.users au ON au.id=a.user_id
   WHERE a.user_id=p_actor AND au.email_confirmed_at IS NOT NULL AND (au.banned_until IS NULL OR au.banned_until<now()) AND a.status='active' AND a.platform_role IN ('platform_admin','super_admin','internal_only')) THEN
   RAISE EXCEPTION 'Invitation administration denied' USING ERRCODE='42501';
 END IF;
 SELECT to_jsonb(t) INTO h FROM public.hotels t WHERE id=p_hotel FOR UPDATE;
 IF h IS NULL OR h->>'deleted_at' IS NOT NULL OR h->>'archived_at' IS NOT NULL OR h->>'status'='archived'
   OR h->'metadata'->>'archive_operational_hold'='true' OR h->'metadata'->>'archived'='true'
   OR h->>'name' LIKE '% (archived)' THEN RAISE EXCEPTION 'Hotel unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM public.hotel_users WHERE id=p_assignment AND hotel_id=p_hotel FOR UPDATE;
 IF u.id IS NULL OR u.status<>'invited' OR u.user_id IS NOT NULL OR u.role NOT IN ('admin','receptionist')
   OR coalesce(u.platform_role,'none')<>'none' THEN RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.hotel_access_invitations SET revoked_at=now()
   WHERE assignment_id=u.id AND revoked_at IS NULL AND accepted_at IS NULL;
 IF p_hash IS NULL THEN RETURN jsonb_build_object('status','revoked'); END IF;
 INSERT INTO public.hotel_access_invitations(assignment_id,hotel_id,email,role,token_hash,expires_at)
   VALUES(u.id,u.hotel_id,lower(btrim(u.email)),u.role,p_hash,now()+interval '7 days') RETURNING * INTO i;
 RETURN jsonb_build_object('id',i.id,'status','pending','expires_at',i.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.accept_hotel_invitation_v1(p_actor uuid,p_hash text,p_accept boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.hotel_access_invitations; u public.hotel_users; h jsonb; email_address text;
BEGIN
 SELECT lower(btrim(email)) INTO email_address FROM auth.users
   WHERE id=p_actor AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<now());
 IF email_address IS NULL THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.hotel_access_invitations WHERE token_hash=p_hash;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 -- Same lock order as issue/revoke. Hotel lifecycle transitions serialize here.
 SELECT to_jsonb(t) INTO h FROM public.hotels t WHERE id=i.hotel_id FOR UPDATE;
 SELECT * INTO u FROM public.hotel_users WHERE id=i.assignment_id FOR UPDATE;
 SELECT * INTO i FROM public.hotel_access_invitations WHERE token_hash=p_hash FOR UPDATE;
 IF h IS NULL OR h->>'deleted_at' IS NOT NULL OR h->>'archived_at' IS NOT NULL OR h->>'status'='archived'
   OR h->'metadata'->>'archive_operational_hold'='true' OR h->'metadata'->>'archived'='true'
   OR h->>'name' LIKE '% (archived)'
   OR email_address<>i.email OR lower(btrim(u.email))<>i.email OR u.hotel_id<>i.hotel_id OR u.role<>i.role
   OR coalesce(u.platform_role,'none')<>'none' OR i.revoked_at IS NOT NULL THEN
   RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE='42501';
 END IF;
 IF i.accepted_at IS NOT NULL THEN
   IF i.accepted_by<>p_actor OR u.user_id IS DISTINCT FROM p_actor OR u.status<>'active' THEN
     RAISE EXCEPTION 'Access no longer active' USING ERRCODE='42501'; END IF;
 ELSE
   IF i.expires_at<=now() OR u.status<>'invited' OR u.user_id IS NOT NULL THEN
     RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
   IF p_accept THEN
     UPDATE public.hotel_users SET user_id=p_actor,status='active',accepted_at=now(),updated_at=now() WHERE id=u.id;
     UPDATE public.hotel_access_invitations SET accepted_at=now(),accepted_by=p_actor WHERE id=i.id;
   END IF;
 END IF;
 RETURN jsonb_build_object('hotelId',i.hotel_id,'hotelName',h->>'name','role',i.role,
   'accepted',i.accepted_at IS NOT NULL OR p_accept,'expiresAt',i.expires_at);
END $$;

-- Only server reads this scoped evidence; never exposes an Auth directory.
CREATE OR REPLACE FUNCTION public.hotel_identity_evidence_v1(p_hotel uuid)
RETURNS TABLE(id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT a.id FROM public.hotel_users a JOIN auth.users u ON u.id=a.user_id
 WHERE a.hotel_id=p_hotel AND a.status='active' AND u.email_confirmed_at IS NOT NULL
 AND (u.banned_until IS NULL OR u.banned_until<now());
$$;
REVOKE ALL ON FUNCTION public.manage_hotel_invitation_v1(uuid,uuid,uuid,text),
 public.accept_hotel_invitation_v1(uuid,text,boolean),public.hotel_identity_evidence_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_hotel_invitation_v1(uuid,uuid,uuid,text),
 public.accept_hotel_invitation_v1(uuid,text,boolean),public.hotel_identity_evidence_v1(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
