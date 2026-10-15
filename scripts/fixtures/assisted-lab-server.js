import {getPermissionsForRole} from './permissions';
const call=async body=>(await fetch('http://127.0.0.1:3381/db',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'})).json();
export const getSupabaseAdmin=()=>({
 auth:{getUser:token=>call({op:'user',token})},
 rpc:(name,args)=>call({op:'rpc',name,args}),
 from(table){
  const data={op:'query',table,filters:[]};const chain={
   select(value){data.select=value;return chain;},order(key){data.order=key;return chain;},limit(n){data.limit=n;return chain;},
   update(patch){data.mode='update';data.patch=patch;return chain;},insert(patch){data.mode='insert';data.patch=patch;return chain;},
   eq(k,v){data.filters.push(['eq',k,v]);return chain;},is(k,v){data.filters.push(['is',k,v]);return chain;},
   in(k,v){data.filters.push(['in',k,v]);return chain;},neq(k,v){data.filters.push(['neq',k,v]);return chain;},
   gte(k,v){data.filters.push(['gte',k,v]);return chain;},lt(k,v){data.filters.push(['lt',k,v]);return chain;},
   not(){return chain;},range(){return chain;},single(){data.single=true;return chain;},maybeSingle(){data.single=true;return chain;},
   then(resolve,reject){return call(data).then(resolve,reject);}
  };return chain;
 }
});
export async function getCurrentHotelForRequest(request){
 const supabase=getSupabaseAdmin();const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 const {data}=await supabase.auth.getUser(token);if(!data?.user)throw Object.assign(Error('Inicia sesión sintética'),{status:401});
 const assignments=(await supabase.from('hotel_users').select('*, hotel:hotels(*)').eq('user_id',data.user.id).eq('status','active')).data||[];
 const internal=assignments.some(a=>a.platform_role==='platform_admin');
 const selected=request.headers.get('x-staynex-hotel-id')||request.cookies?.get('staynex_active_hotel_id')?.value||assignments[0]?.hotel_id;
 const assignment=assignments.find(a=>a.hotel_id===selected);
 if(!assignment&&!internal)throw Object.assign(Error('Hotel no autorizado'),{status:403});
 const hotel=(await supabase.from('hotels').select('*').eq('id',selected).single()).data;
 const role=assignment?.role||'admin';
 return {supabase,user:data.user,hotel,hotelUser:assignment,role,platformRole:internal?'platform_admin':'none',fallback:false,
  permissions:getPermissionsForRole(role),accessDenied:false,canSwitchWorkspaces:true,platformConsoleAccess:internal,
  availableHotels:assignments.map(a=>({hotel:a.hotel,hotelUser:a,role:a.role})),state:null};
}
export async function getPlatformContext(request){
 const c=await getCurrentHotelForRequest(request);if(c.platformRole!=='platform_admin')throw Object.assign(Error('Platform denied'),{status:403});return c;
}
