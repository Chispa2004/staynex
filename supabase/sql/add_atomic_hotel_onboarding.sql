-- Incremental prerequisite for both hotel creation handlers. No existing rows,
-- memberships, flags or hotel permissions are changed. Apply BEFORE new code.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hotel_creation_requests (
  actor_id uuid NOT NULL, request_key uuid NOT NULL, request_payload jsonb NOT NULL,
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE SET NULL,
  hotel_user_id uuid REFERENCES public.hotel_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,request_key)
);
ALTER TABLE public.hotel_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_creation_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_hotel_onboarding_v1(p_actor uuid,p_key uuid,p_mode text,p_hotel jsonb,p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE prior public.hotel_creation_requests; h public.hotels; u public.hotel_users; s public.hotel_onboarding_state;
  payload jsonb; hid uuid:=gen_random_uuid(); slug_base text; candidate text;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR p_mode IS NULL OR p_mode NOT IN ('platform','workspace') OR p_hotel IS NULL OR jsonb_typeof(p_hotel)<>'object'
    OR p_email IS NULL OR p_email !~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$'
    OR coalesce(btrim(p_hotel->>'name'),'')='' OR coalesce(btrim(p_hotel->>'city'),'')=''
    OR coalesce(p_hotel->>'country_code','') !~ '^[A-Z]{2}$'
    OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_hotel->>'timezone') THEN
    RAISE EXCEPTION 'Invalid creation contract' USING ERRCODE='22023';
  END IF;
  payload:=jsonb_build_object('mode',p_mode,'hotel',p_hotel,'email',p_email);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_key::text,0));
  SELECT * INTO prior FROM public.hotel_creation_requests WHERE actor_id=p_actor AND request_key=p_key;
  IF FOUND THEN
    IF prior.request_payload<>payload THEN RAISE EXCEPTION 'Idempotency payload mismatch' USING ERRCODE='22023'; END IF;
    SELECT * INTO h FROM public.hotels WHERE id=prior.hotel_id;
    SELECT * INTO u FROM public.hotel_users WHERE id=prior.hotel_user_id AND hotel_id=h.id;
    SELECT * INTO s FROM public.hotel_onboarding_state WHERE hotel_id=h.id;
    IF h.id IS NULL OR u.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'Prior result unavailable' USING ERRCODE='P0002'; END IF;
    RETURN jsonb_build_object('hotel',to_jsonb(h),'hotelUser',to_jsonb(u),'state',to_jsonb(s),'replayed',true);
  END IF;
  -- Serialize only slug allocation by this contract. Other writers remain
  -- protected by existing uniqueness constraints; a conflict rolls back all.
  PERFORM pg_advisory_xact_lock(hashtextextended('staynex:hotel-slug-allocation',0));
  slug_base:=coalesce(nullif(p_hotel->>'slug',''),nullif(p_hotel->>'workspace_slug',''),
    nullif(trim(both '-' from regexp_replace(lower(p_hotel->>'name'),'[^a-z0-9]+','-','g')),''),'hotel');
  candidate:=left(slug_base,48);
  IF EXISTS(SELECT 1 FROM public.hotels WHERE slug=candidate OR workspace_slug=candidate) THEN
    candidate:=left(slug_base,15)||'-'||replace(hid::text,'-','');
  END IF;
  INSERT INTO public.hotels(id,name,brand_name,slug,workspace_slug,country_code,city,timezone,timezone_integrity_status,
    default_language,whatsapp_number,support_email,support_phone,brand_color,secondary_color,logo_url,favicon_url,subscription_plan,description,address,phone,check_in_time,check_out_time,ai_auto_reply_enabled,hotel_live_mode,metadata)
  VALUES(hid,p_hotel->>'name',p_hotel->>'brand_name',candidate,candidate,p_hotel->>'country_code',p_hotel->>'city',p_hotel->>'timezone','unverified',
    p_hotel->>'default_language',p_hotel->>'whatsapp_number',p_hotel->>'support_email',p_hotel->>'support_phone',p_hotel->>'brand_color',p_hotel->>'secondary_color',
    p_hotel->>'logo_url',p_hotel->>'favicon_url',p_hotel->>'subscription_plan',p_hotel->>'description',p_hotel->>'address',p_hotel->>'phone',p_hotel->>'check_in_time',p_hotel->>'check_out_time',false,false,'{}'::jsonb) RETURNING * INTO h;
  INSERT INTO public.hotel_onboarding_state(hotel_id,current_step,completed_steps,onboarding_completed)
    VALUES(h.id,'hotel','[]'::jsonb,false) RETURNING * INTO s;
  INSERT INTO public.hotel_users(hotel_id,user_id,email,role,status,is_default,invited_at,accepted_at)
    VALUES(h.id,CASE WHEN p_mode='workspace' THEN p_actor ELSE NULL END,p_email,
      CASE WHEN p_mode='workspace' THEN 'owner' ELSE 'admin' END,
      CASE WHEN p_mode='workspace' THEN 'active' ELSE 'invited' END,p_mode='platform',now(),
      CASE WHEN p_mode='workspace' THEN now() ELSE NULL END) RETURNING * INTO u;
  INSERT INTO public.hotel_creation_requests(actor_id,request_key,request_payload,hotel_id,hotel_user_id)
    VALUES(p_actor,p_key,payload,h.id,u.id);
  RETURN jsonb_build_object('hotel',to_jsonb(h),'hotelUser',to_jsonb(u),'state',to_jsonb(s),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.create_hotel_onboarding_v1(uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_hotel_onboarding_v1(uuid,uuid,text,jsonb,text) TO service_role;
-- A late progress request must never undo a completed configuration.
CREATE OR REPLACE FUNCTION public.save_hotel_onboarding_v1(p_hotel_id uuid,p_step text,p_steps jsonb,p_completed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result public.hotel_onboarding_state;
BEGIN
  IF p_hotel_id IS NULL OR p_step IS NULL OR p_step NOT IN ('hotel','users','pms','whatsapp','knowledge','readiness')
    OR p_steps IS NULL OR jsonb_typeof(p_steps)<>'array' OR p_completed IS NULL THEN
    RAISE EXCEPTION 'Invalid progress contract' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.hotel_onboarding_state(hotel_id,current_step,completed_steps,onboarding_completed,onboarding_completed_at)
  VALUES(p_hotel_id,p_step,p_steps,p_completed,CASE WHEN p_completed THEN now() ELSE NULL END)
  ON CONFLICT(hotel_id) DO UPDATE SET
    current_step=excluded.current_step, completed_steps=excluded.completed_steps,
    onboarding_completed=hotel_onboarding_state.onboarding_completed OR excluded.onboarding_completed,
    onboarding_completed_at=coalesce(hotel_onboarding_state.onboarding_completed_at,excluded.onboarding_completed_at),updated_at=now()
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.save_hotel_onboarding_v1(uuid,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_hotel_onboarding_v1(uuid,text,jsonb,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
