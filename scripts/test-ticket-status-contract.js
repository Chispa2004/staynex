import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as permissions from '../dashboard/lib/permissions.js';
const require=createRequire(new URL('../dashboard/package.json',import.meta.url)),swc=require('next/dist/build/swc');
const hotelId='00000000-0000-4000-8000-000000000001',ticketId='00000000-0000-4000-8000-000000000100';
let role='admin',platformRole='none',writes=[];
const {code}=await swc.transform(readFileSync(new URL('../dashboard/app/api/tickets/[id]/status/route.js',import.meta.url),'utf8'),{filename:'status.js',jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}});
const module={exports:{}};
const mocks={'next/server':{NextResponse:Response},'@/lib/permissions':permissions,
  '@/lib/current-hotel':{getCurrentHotelForRequest:async()=>({hotel:{id:hotelId},role,platformRole,user:{id:'synthetic-user'}})},
  '@/lib/tickets':{updateTicketStatus:async args=>{writes.push(args);assert.equal(args.hotelId,hotelId);if(args.ticketId!==ticketId)throw Error('No scoped ticket');return {id:ticketId,hotel_id:hotelId,status:args.status};}}
};
new Function('require','module','exports',code)(name=>{assert(name in mocks);return mocks[name];},module,module.exports);
const patch=(status,id=ticketId)=>module.exports.PATCH(new Request('https://synthetic.invalid/api/tickets/'+id+'/status',{method:'PATCH',body:JSON.stringify({status})}),{params:Promise.resolve({id})});
for(const status of ['open','in_progress','completed']){const r=await patch(status);assert.equal(r.status,200);assert.equal((await r.json()).ticket.status,status);}
assert.equal(writes.length,3);
for(const status of ['Hecho','pending','closed','cancelled',''])assert.equal((await patch(status)).status,400);
assert.equal(writes.length,3);
role='analyst';assert.equal((await patch('completed')).status,403);
role='admin';platformRole='support';assert.equal((await patch('completed')).status,403);assert.equal(writes.length,3);
platformRole='none';assert.equal((await patch('open','ticket-from-another-hotel')).status,500);assert.equal(writes.at(-1).hotelId,hotelId);
console.log('PASS actual ticket PATCH contract: three stored values unchanged, invalid labels rejected, existing role/support denials and hotel scope retained; synthetic transport only');
