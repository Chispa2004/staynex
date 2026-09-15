// Real SQL in a fresh local, network-none, tmpfs PostgreSQL. Never reads .env.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),evidence=path.join(root,'.npm-cache/demo-message-stages');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME)$/i.test(k)));
Object.assign(env,{SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true'});
async function main(){
    const {demoMessageStages:generate}=await import('./demo-message-stages.js');
    const demoMessageStages=options=>generate({...options,edition:'legacy'});
  const {attentionDashboardDTO}=await import('../shared/message-attention/contract.js');
  const pg=require('./ci/disposable-postgres.cjs').createDisposablePostgres({env});
  const results=[];let sequence=0;
  fs.mkdirSync(evidence,{recursive:true});
  const sql=(query,error)=>{
    let output,code=0;
    try{output=execFileSync(pg.docker,[...pg.host,'exec','-i',pg.container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input:query,env,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000});}
    catch(e){code=e.status||1;output=String(e.stdout||'')+String(e.stderr||'');}
    fs.writeFileSync(path.join(evidence,`${++sequence}.log`),query+'\nEXIT '+code+'\n'+output);
    if(error){assert.notEqual(code,0);assert.match(output,error);}else assert.equal(code,0,output);
    return output.trim();
  };
  const file=name=>sql(fs.readFileSync(path.join(root,name),'utf8'));
  const check=(name,fn)=>{fn();results.push({name,result:'PASS'});console.log('PASS '+name);};
  try{
    sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create publication supabase_realtime;grant usage on schema public to service_role;');
    for(const name of ['../schema','create_hotels_and_hotel_users','create_user_roles_and_hotel_assignments','add_platform_role_to_hotel_users','add_multilanguage_translation_layer','create_enterprise_audit_logs','create_conversation_ai_state','twilio_inbound_messagesid_dedupe','create_reservations_core','create_message_attention','extend_attention_dashboard_messages']) file('supabase/sql/'+name+'.sql');
    const h='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333';
    sql(`insert into hotels(id,name,slug,timezone,whatsapp_number) values('${h}','Hotel Demo Checkin','hotel-demo-checkin','Europe/Madrid','synthetic-only:a'),('${other}','Other synthetic hotel','other','Europe/Madrid','synthetic-only:b');insert into hotel_users(hotel_id,user_id,role,status,platform_role) values('${h}','${actor}','receptionist','active','none');`);
    const ref=sql("select (clock_timestamp() at time zone 'Europe/Madrid')::date;");
    const fixture=demoMessageStages({hotelId:h,actorId:actor,referenceDate:ref});
    const ack="set staynex.demo_isolated='on';set staynex.send_automations='false';";
    const load=()=>sql(ack+fixture.sql);
    const dash=(hotel=h,urgent=false,origin='simulated',cursor=null)=>JSON.parse(sql(`set role service_role;select staynex_attention_dashboard_v2('${hotel}','${origin}',${urgent},${cursor?`'${cursor.at}'`:'null'},${cursor?`'${cursor.id}'`:'null'});`));
    const counts=()=>sql("select json_build_array((select count(*) from guests),(select count(*) from reservations),(select count(*) from conversations),(select count(*) from messages),(select count(*) from message_attention),(select count(*) from enterprise_audit_logs),(select count(*) from conversation_ai_state));");
    const otherBefore=sql(`select row_to_json(hotels) from hotels where id='${other}';`);
    check('Guard rejects missing isolation acknowledgement without inserts',()=>{sql(fixture.sql,/Require explicit isolated/);assert.equal(counts(),'[0, 0, 0, 0, 0, 0, 0]');});
    check('Enabled user trigger blocks the load before any side effect',()=>{
      sql("create function synthetic_trigger() returns trigger language plpgsql as $$begin raise exception 'TRIGGER RAN';end$$;create trigger synthetic_outbound before insert on messages for each row execute function synthetic_trigger();");
      sql(ack+fixture.sql,/Enabled user trigger/);assert.equal(counts(),'[0, 0, 0, 0, 0, 0, 0]');sql('drop trigger synthetic_outbound on messages;drop function synthetic_trigger();');
    });
    check('Three canonical cases: 3 received / 1 resolved / 2 pending / 1 urgent',()=>{load();assert.deepEqual(dash().counters,{received:3,resolved:1,pending:2,urgent:1});});
    if(process.argv.includes('--integrated')) await require('./fixtures/demo-routes-integration.cjs').runDemoRoutesIntegration({pg,env,root,hotelId:h,otherHotelId:other,actorId:actor,fixture});
    check('Guest, reservation, phase, order, state and same-hotel Inbox links',()=>{
      const d=dash(),dto=attentionDashboardDTO(d,h);
      assert.equal(dto.coverage,'complete');assert.deepEqual(d.messages.map(m=>[m.guest,m.status,m.stayStage]),[
        ['Carlos Ruiz','Pendiente','Durante la estancia'],['Ana López','Pendiente','Antes de la llegada'],['Lucía Martín','Resuelto','Después de la salida']]);
      assert.equal(d.messages[0].room,'208');
      for(const m of dto.messages){const c=fixture.cases.find(c=>c.messageId===m.id);assert.equal(m.href,'/dashboard/inbox?conversationId='+c.conversationId);
        const read=JSON.parse(sql(`set role service_role;select staynex_attention_read_v1('${h}','${c.conversationId}',array['${c.messageId}']::uuid[]);`));assert.equal(read.items[0].status,m.status==='Resuelto'?'resolved':'pending');}
    });
    check('Idempotent repeat preserves rows, alert and explicit resolution event',()=>{const before=counts();load();assert.equal(counts(),before);assert.equal(before,'[3, 3, 3, 3, 1, 1, 1]');assert.equal(sql("select count(*) from enterprise_audit_logs where metadata @> '{\"demo\":true,\"fixture\":\"staynex_message_stages_v1\"}';"),'1');});
    check('Origin filter is explicit; unknown/traced never substitute demo rows',()=>{assert.equal(dash(h,false,'traced').counters.received,0);assert.equal(dash(h,false,'unknown').messages.length,0);assert.equal(dash(h,true).messages.length,1);});
    check('Hotel B remains unchanged; browser cannot execute backend RPC',()=>{assert.deepEqual(dash(other).counters,{received:0,resolved:0,pending:0,urgent:0});assert.equal(sql(`select row_to_json(hotels) from hotels where id='${other}';`),otherBefore);for(const role of ['anon','authenticated'])sql(`set role ${role};select staynex_attention_dashboard_v2('${h}','simulated');`,/permission denied/);});
    check('Hotel midnight bounds received count without discarding older pending stock',()=>{
      const ana=fixture.cases[0];
      sql(`insert into messages(hotel_id,conversation_id,sender_type,content,metadata,created_at) values('${h}','${ana.conversationId}','guest','Synthetic previous day','{"demo":true}',('${ref}'::date::timestamp at time zone 'Europe/Madrid')-interval '1 second');`);
      assert.deepEqual(dash().counters,{received:3,resolved:1,pending:3,urgent:1});
      sql("delete from messages where content='Synthetic previous day';");
    });
    check('Ambiguous or foreign reservation is not assigned a stage or foreign identity',()=>{
      const ana=fixture.cases[0];
      const result=JSON.parse(sql(`begin;
        insert into reservations(hotel_id,guest_id,pms_reservation_id,guest_name,arrival_date,departure_date) values('${h}','${ana.guestId}','extra','Unrelated',current_date,current_date+3);
        update messages set metadata=metadata-'reservation_id' where id='${ana.messageId}';
        select staynex_attention_dashboard_v2('${h}','simulated');rollback;`));
      assert.equal(result.messages.find(m=>m.id===ana.messageId).stayStage,null);
      const foreign=JSON.parse(sql(`begin;update reservations set hotel_id='${other}',guest_name='Other tenant' where id='${ana.reservationId}';select staynex_attention_dashboard_v2('${h}','simulated');rollback;`));
      assert.equal(foreign.messages.find(m=>m.id===ana.messageId).stayStage,null);
      assert.notEqual(foreign.messages.find(m=>m.id===ana.messageId).guest,'Other tenant');
    });
    // Preserve actual database response and rows for the ignored visual harness before mutation tests.
    const snapshot={referenceDate:ref,hotelId:h,actorId:actor,cases:fixture.cases,dashboard:dash(),
      messages:JSON.parse(sql('select json_agg(messages) from messages;')),
      states:JSON.parse(sql('select json_agg(message_attention) from message_attention;')),
      reservations:JSON.parse(sql('select json_agg(reservations) from reservations;'))};
    fs.writeFileSync(path.join(evidence,'synthetic-postgres-snapshot.json'),JSON.stringify(snapshot,null,2));
    const remove=()=>sql(ack+demoMessageStages({hotelId:h,actorId:actor,referenceDate:ref,action:'remove'}).sql);
    check('Removal refuses dependent scheduled activity instead of cascading it',()=>{
      sql(`insert into automation_events(reservation_id,event_type,status) values('${fixture.cases[0].reservationId}','synthetic-blocker','cancelled');`);
      sql(ack+demoMessageStages({hotelId:h,actorId:actor,referenceDate:ref,action:'remove'}).sql,/dependent activity/);
      assert.equal(dash().counters.received,3);assert.equal(sql('select count(*) from automation_events;'),'1');
      sql("delete from automation_events where event_type='synthetic-blocker';");
    });
    check('Reversible, repeatable removal touches only owned demo records',()=>{remove();remove();assert.equal(counts(),'[0, 0, 0, 0, 0, 0, 0]');load();});
    const carlos=fixture.cases[1];
    check('Existing additional urgencies are included and paginate before pending/resolved',()=>{
      sql(`insert into messages(hotel_id,conversation_id,sender_type,content,metadata,created_at) select '${h}','${carlos.conversationId}','guest','Additional synthetic urgency', '{"demo":true}',(select created_at from messages where id='${carlos.messageId}') from generate_series(1,10);`);
      const first=dash();assert.equal(first.counters.received,13);assert.equal(first.counters.urgent,11);assert.equal(first.messages.length,8);assert.ok(first.messages.every(m=>m.priority==='urgent'));
      const second=dash(h,false,'simulated',first.nextCursor);assert.equal(second.messages.length,5);assert.equal(second.messages.filter(m=>m.priority==='urgent').length,3);assert.equal(new Set([...first.messages,...second.messages].map(m=>m.id)).size,13);
      sql(`delete from messages where hotel_id='${h}' and content='Additional synthetic urgency';`);
    });
    check('Resolving Carlos removes pending and urgent without changing stay stage',()=>{
      sql(`set role service_role;select staynex_attention_transition_v1('${h}','${carlos.conversationId}','${actor}','44444444-4444-4444-8444-444444444444','resolved','[{"messageId":"${carlos.messageId}","expectedStatus":"pending","expectedVersion":1}]');`);
      assert.deepEqual(dash().counters,{received:3,resolved:2,pending:1,urgent:0});assert.equal(dash().messages.find(m=>m.id===carlos.messageId).stayStage,'Durante la estancia');load();assert.equal(dash().counters.urgent,0);
    });
    check('Cleanup refuses subsequent human activity and preserves history',()=>{sql(ack+demoMessageStages({hotelId:h,actorId:actor,referenceDate:ref,action:'remove'}).sql,/subsequent activity/);assert.equal(dash().counters.received,3);});
    check('Disabled contract yields no listing, never synthetic fallback',()=>{file('supabase/sql/disable_message_attention.sql');sql(`select staynex_attention_dashboard_v2('${h}','simulated');`,/Attention contract disabled/);});
    fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({postgres:sql('show server_version;'),network:pg.inspect.HostConfig.NetworkMode,results},null,2));
  }finally{pg.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
