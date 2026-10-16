BEGIN;
CREATE TABLE IF NOT EXISTS public.hotel_information_reviews (
 hotel_id uuid PRIMARY KEY REFERENCES public.hotels(id), content_hash text NOT NULL,
 reviewed_at timestamptz NOT NULL, reviewed_by uuid NOT NULL
);
ALTER TABLE public.hotel_information_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_information_reviews FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.hotel_information_review_v1(p_hotel uuid,p_actor uuid DEFAULT NULL,p_expected text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE content jsonb; fingerprint text; prior public.hotel_information_reviews; h jsonb;
BEGIN
 SELECT to_jsonb(t) INTO h FROM public.hotels t WHERE id=p_hotel FOR SHARE;
 IF h IS NULL THEN RAISE EXCEPTION 'Hotel missing' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY item::text),'[]') INTO content FROM (
   SELECT jsonb_build_object('source','hotel','row',to_jsonb(k)) item FROM public.hotel_knowledge k WHERE hotel_id=p_hotel
   UNION ALL SELECT jsonb_build_object('source','local','row',to_jsonb(k)) FROM public.local_knowledge_items k WHERE hotel_id=p_hotel
 ) entries;
 fingerprint:=encode(sha256(convert_to(content::text,'UTF8')),'hex');
 IF p_expected IS NOT NULL THEN
   IF p_expected<>fingerprint OR content='[]'::jsonb THEN RAISE EXCEPTION 'Information changed; review again' USING ERRCODE='40001'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.hotel_users a JOIN auth.users au ON au.id=a.user_id WHERE a.user_id=p_actor AND a.status='active'
     AND au.email_confirmed_at IS NOT NULL AND (au.banned_until IS NULL OR au.banned_until<now())
     AND ((a.hotel_id=p_hotel AND a.role IN ('owner','admin','manager')) OR a.platform_role IN ('platform_admin','super_admin','internal_only'))) THEN
     RAISE EXCEPTION 'Review denied' USING ERRCODE='42501'; END IF;
   IF h->>'archived_at' IS NOT NULL OR h->>'deleted_at' IS NOT NULL OR h->>'status'='archived'
     OR h->'metadata'->>'archive_operational_hold'='true' OR h->'metadata'->>'archived'='true'
     OR h->>'name' LIKE '% (archived)' THEN RAISE EXCEPTION 'Hotel unavailable' USING ERRCODE='42501'; END IF;
   INSERT INTO public.hotel_information_reviews VALUES(p_hotel,fingerprint,now(),p_actor)
     ON CONFLICT(hotel_id) DO UPDATE SET content_hash=excluded.content_hash,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by;
 END IF;
 SELECT * INTO prior FROM public.hotel_information_reviews WHERE hotel_id=p_hotel;
 RETURN jsonb_build_object('hash',fingerprint,'reviewed',coalesce(prior.content_hash=fingerprint,false),
   'reviewedAt',CASE WHEN prior.content_hash=fingerprint THEN prior.reviewed_at ELSE NULL END,
   'count',jsonb_array_length(content));
END $$;
REVOKE ALL ON FUNCTION public.hotel_information_review_v1(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_information_review_v1(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
