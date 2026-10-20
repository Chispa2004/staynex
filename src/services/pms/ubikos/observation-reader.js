import {readUbikosJson} from './bounded-json-read.js';
import {prepareUbikosListRequest} from './list-read.js';
import {observeUbikosList} from './list-observation.js';
import {attachUbikosDiagnostic} from './private-diagnostic.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
// Server factory. No environment access here: the Next server-only boundary owns configuration.
export function createUbikosObservationReader({enabled=false,hotelId,connectionId,apiKey,
  fetchImpl=globalThis.fetch,clock=()=>new Date().toISOString()}={}) {
  const configured=enabled===true && uuid.test(hotelId||'') && uuid.test(connectionId||'') &&
    typeof apiKey==='string' && apiKey.length>0 && apiKey.length<=4096 && !/[^\x21-\x7e]/.test(apiKey);
  const available=scope=>configured && scope.hotelId===hotelId && scope.connectionId===connectionId &&
    scope.externalHotelId==='10318';
  return Object.freeze({
    simulated:false,
    available,
    async read(scope) {
      if(!available(scope))throw fail('SERVER_READING_UNAVAILABLE');
      const result=await readUbikosJson({
        prepareRequest:()=>prepareUbikosListRequest(scope,apiKey),
        consumePayload:rows=>observeUbikosList({provider:'ubikos',externalHotelId:'10318',
          operation:scope.operation,...(scope.date?{date:scope.date}:{}),observedAt:clock()},rows),
        fetchImpl,timeoutMs:10000,maxBytes:262144,signal:scope.signal
      });
      if(!result.ok || scope.signal?.aborted)throw attachUbikosDiagnostic(fail('READ_FAILED'),
        scope.signal?.aborted?{...result,code:'UBIKOS_CANCELLED'}:result);
      if(result.observation.status==='rejected')throw attachUbikosDiagnostic(fail('STRUCTURE_INVALID',502),result,true);
      // A reflected key is never a permissible room reference, even on an otherwise valid response.
      for(const row of result.observation.records) {
        if([row.externalBookingId,row.externalRoomReference].some(v=>v?.includes(apiKey)))
          throw attachUbikosDiagnostic(fail('STRUCTURE_INVALID',502),result,true);
      }
      return result.observation;
    }
  });
}
