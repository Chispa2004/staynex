-- READ ONLY. Definition checks are not a concurrency test.
begin transaction read only;
do $verify$
declare f record; expected record;
begin
  if exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.messages'::regclass
    and (t.tgname='staynex_message_attention_insert' or p.proname like 'staynex_attention_%'))
    or to_regprocedure('public.staynex_attention_on_insert()') is not null then raise exception 'Inbound attention trigger must not exist'; end if;
  if not exists(select 1 from pg_attribute where attrelid='public.messages'::regclass and attname='attention_inclusion_version'
    and atttypid='smallint'::regtype and not attnotnull and not atthasmissing and not attisdropped) then raise exception 'Invalid historical inclusion column'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='message_attention_inclusion_version_check'
    and pg_get_constraintdef(oid)='CHECK ((attention_inclusion_version = 1))') then raise exception 'Invalid inclusion constraint'; end if;
  if not exists(select 1 from pg_class where oid=to_regclass('public.message_attention') and relrowsecurity) then raise exception 'Attention RLS missing'; end if;
  if exists(select 1 from pg_policy where polrelid='public.message_attention'::regclass) then raise exception 'Unexpected browser attention policy'; end if;
  if has_table_privilege('anon','public.message_attention','INSERT,UPDATE,DELETE,SELECT') or has_table_privilege('authenticated','public.message_attention','INSERT,UPDATE,DELETE,SELECT')
    or has_table_privilege('service_role','public.message_attention','INSERT,UPDATE,DELETE') then raise exception 'Unexpected table privilege'; end if;
  if (select count(*) from pg_constraint where conrelid='public.message_attention'::regclass and contype='f' and confrelid='public.messages'::regclass and array_length(conkey,1)=3)<>1 then raise exception 'Composite message relation missing'; end if;
  for expected in select * from (values ('staynex_attention_eligible','b154c96a4182c4c771f4bcf662a264aa'),
('staynex_attention_origin','0baba852b2a72c735e6fddd27138a503'),
('staynex_attention_require_contract','2a20027194e917baf6b241c7a57b4c7f'),
('staynex_attention_effective','6b71b56ab31b0b8d4e80133bdd15e8da'),
('staynex_attention_read_v1','5ca636b209696fcf2095069902694fcd'),
('staynex_attention_transition_v1','d4f74f8f7f5429f2311beb2244670fea'),
('staynex_attention_dashboard_v1','063b3f796e51d1220ab33bc63a1ccf9d')) v(name,hash) loop
    select p.*,n.nspname into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=expected.name;
    if not found or md5(f.prosrc)<>expected.hash or not ('search_path=pg_catalog'=any(f.proconfig)) then raise exception 'Incompatible function %',expected.name; end if;
    if exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.privilege_type='EXECUTE' and a.grantee not in (f.proowner,(select oid from pg_roles where rolname='service_role'))) then raise exception 'Unexpected function caller %',expected.name; end if;
    if expected.name not in ('staynex_attention_eligible','staynex_attention_effective') and not f.prosecdef then raise exception 'Unexpected security mode %',expected.name; end if;
    if expected.name='staynex_attention_dashboard_v1' and f.provolatile<>'s' then raise exception 'Dashboard requires a stable read snapshot'; end if;
  end loop;
  perform public.staynex_attention_require_contract();
end $verify$;
select a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull from pg_attribute a where a.attrelid='public.message_attention'::regclass and a.attnum>0 and not a.attisdropped;
select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.message_attention'::regclass;
select count(*) as inconsistent_rows from public.message_attention a left join public.messages m on m.id=a.message_id and m.hotel_id=a.hotel_id and m.conversation_id=a.conversation_id where m.id is null or not public.staynex_attention_eligible(m.sender_type,m.metadata);
rollback;
