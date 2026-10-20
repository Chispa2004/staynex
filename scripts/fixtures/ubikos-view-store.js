import {createUbikosObservationReader} from '../../src/services/pms/ubikos/observation-reader.js';
// Synthetic in-memory persistence, never installed in the normal application.
import {randomUUID} from 'node:crypto';
const key=Symbol.for('staynex.ubikos.view.lab');
export const state=globalThis[key] ||= {
  hotels:[{id:'00000000-0000-4000-8000-000000000002',name:'Hotel sintético B',lifecycle_status:'active'}],
  connections:[], creations:new Map(), writes:[], calls:[], scenario:'normal', role:'admin'
};
const actor={id:'00000000-0000-4000-8000-000000000009',email:'platform@example.invalid'};
const deny=()=>{throw Object.assign(Error('Synthetic access denied'),{status:403});};
const authenticated=request=>{if(request.headers.get('authorization')!=='Bearer synthetic-only')deny();};
export const supabase={
  rpc:async(name,args)=>{
    if(name!=='create_hotel_onboarding_v1'||args.p_actor!==actor.id||!['platform','workspace'].includes(args.p_mode))deny();
    const previous=state.creations.get(args.p_key);
    if(previous)return {data:{...previous,replayed:true}};
    const hotel={...args.p_hotel,id:randomUUID(),lifecycle_status:'active'};
    const workspace=args.p_mode==='workspace';
    const result={hotel,hotelUser:{id:randomUUID(),hotel_id:hotel.id,email:args.p_email,
      user_id:workspace?args.p_actor:null,role:workspace?'owner':'admin',status:workspace?'active':'invited'},
      state:{hotel_id:hotel.id,onboarding_completed:false}};
    state.hotels.push(hotel);state.creations.set(args.p_key,result);
    state.writes.push({type:'local_hotel_creation',hotelId:hotel.id});
    // Lab platform principal has an explicit id-based allowlist (state.hotels).
    // Invited email is never resolved to access and no email is sent.
    return {data:result};
  },
  from:table=>{
    if(!['hotel_pms_connections','hotel_onboarding_state'].includes(table))throw Error('LAB_OPERATIONAL_TABLE_BLOCKED');
    const filters=[];let patch=null,one=false;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},limit(){return q;},order(){return q;},
      maybeSingle(){one=true;return q;},single(){one=true;return q;},
      upsert(value){patch=value;return q;},
      then(resolve,reject){
        if(patch){
          if(patch.provider!=='ubikos'||patch.metadata?.property_id!=='10318' ||
            patch.metadata?.credentials_encrypted || patch.encrypted_client_secret ||
            !state.hotels.some(h=>h.id===patch.hotel_id))return Promise.reject(Error('LAB_BINDING_ONLY')).then(resolve,reject);
          let connection=state.connections.find(c=>c.hotel_id===patch.hotel_id&&c.provider==='ubikos');
          if(!connection){connection={id:randomUUID()};state.connections.push(connection);}
          Object.assign(connection,patch);
          state.writes.push({type:'local_connection_configuration',hotelId:patch.hotel_id});
          return Promise.resolve({data:structuredClone(connection)}).then(resolve,reject);
        }
        const source=table==='hotel_onboarding_state'?state.hotels.map(h=>({hotel_id:h.id,onboarding_completed:false,completed_steps:[],current_step:'hotel'})):state.connections;
        const data=source.filter(r=>filters.every(f=>f(r)));
        return Promise.resolve({data:structuredClone(one?data[0]||null:data)}).then(resolve,reject);
      }
    };return q;
  }
};
export const getCurrentHotelForRequest=async request=>{
  authenticated(request);
  const hotel=state.hotels.find(h=>h.id===request.headers.get('x-staynex-hotel-id'));
  if(!hotel)deny();
  return {hotel,user:actor,supabase,role:state.role,permissions:[],platformPermissions:[],platformRole:'platform_admin',fallback:false,
    canSwitchWorkspaces:true,canCreateWorkspaces:true,multiPropertyAccess:true,
    availableHotels:state.hotels.map(h=>({hotel:h,role:state.role,hotelUser:{user_id:actor.id,hotel_id:h.id,role:state.role,status:'active'}}))};
};
export const getPlatformContext=async request=>{authenticated(request);return {supabase,user:actor,platformRole:'platform_admin',platformPermissions:[]};};
export const getPlatformOverview=async()=>({hotels:state.hotels.map(h=>({...h,healthScore:0,metrics:{}})),metrics:{},revenue:{}});
export const writePlatformAuditLog=async()=>{};
export const writeEnterpriseAuditLog=async()=>{};
export const normalizeOptional=v=>v||null;
export const slugify=v=>v;
export const ubikosObservationReader={simulated:true,available:()=>true,read:async scope=>{
  state.calls.push({operation:scope.operation,hotelId:scope.hotelId,date:scope.date});
  const scenario=state.scenario;
  const reader=createUbikosObservationReader({enabled:true,hotelId:scope.hotelId,connectionId:scope.connectionId,
    apiKey:'SYNTHETIC-ONLY-NOT-A-CREDENTIAL',fetchImpl:async(url,options)=>{
      if(url.hostname!=='api.ubikos.es'||options.redirect!=='manual'||options.method!=='GET')throw Error('LAB_CONTRACT');
      await new Promise(resolve=>setTimeout(resolve,scenario==='slow'?2400:250));
      if(scenario==='error')return new Response('SYNTHETIC_PROVIDER_ERROR_DO_NOT_EXPOSE',{status:503});
      const rows=scenario==='empty'?[]:[{BOOKING_ID:8101,ROOM_ID:'0027'},{BOOKING_ID:8101,ROOM_ID:'0027'},
        {BOOKING_ID:8102,ROOM_ID:''},{BOOKING_ID:8103,NAME:'PERSONA INVENTADA NO MOSTRAR'}];
      return Response.json(rows);
    }});
  return reader.read(scope);
}};
