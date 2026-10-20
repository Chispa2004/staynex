// Internal transport reused by the two explicit Ubikos request contracts.
// Callers validate destination/authentication; no retries, redirects or raw output.
const fail = code => Object.assign(new Error(code), {code});
// Exact, generic JSON error tokens, NOT an asserted Ubikos error contract.
// Never classify free text, substrings, HTML or a reflected URL/credential.
const errorCategories = Object.freeze({
  invalid_api_key:'AUTHENTICATION_REPORTED', INVALID_API_KEY:'AUTHENTICATION_REPORTED',
  unauthorized:'AUTHENTICATION_REPORTED', UNAUTHORIZED:'AUTHENTICATION_REPORTED',
  forbidden:'ACCESS_RESTRICTION_REPORTED', FORBIDDEN:'ACCESS_RESTRICTION_REPORTED',
  invalid_parameter:'REQUEST_VALIDATION_REPORTED', INVALID_PARAMETER:'REQUEST_VALIDATION_REPORTED',
  missing_parameter:'REQUEST_VALIDATION_REPORTED', MISSING_PARAMETER:'REQUEST_VALIDATION_REPORTED',
  bad_request:'REQUEST_VALIDATION_REPORTED', BAD_REQUEST:'REQUEST_VALIDATION_REPORTED',
  rate_limit_exceeded:'RATE_LIMIT_REPORTED', RATE_LIMIT_EXCEEDED:'RATE_LIMIT_REPORTED'
});
function classifyErrorJson(payload) {
  if(!payload || typeof payload!=='object' || Array.isArray(payload))return 'DETAIL_UNCLASSIFIED';
  const tokens=[payload.code,typeof payload.error==='string'?payload.error:payload.error?.code].filter(v=>v!==undefined);
  if(!tokens.length || tokens.some(v=>typeof v!=='string' || !Object.hasOwn(errorCategories,v)))return 'DETAIL_UNCLASSIFIED';
  const categories=new Set(tokens.map(v=>errorCategories[v]));
  return categories.size===1?[...categories][0]:'DETAIL_UNCLASSIFIED';
}
async function inspectErrorBody(reader,limit) {
  const chunks=[];let size=0;
  try {
    while(true) {
      const part=await reader.read();if(part.done)break;
      size+=part.value.byteLength;
      if(size>limit)return {category:'DETAIL_UNCLASSIFIED',bodyStatus:'BODY_LIMIT_EXCEEDED'};
      chunks.push(part.value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const category=classifyErrorJson(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
    return {category,bodyStatus:category==='DETAIL_UNCLASSIFIED'?'DETAIL_UNCLASSIFIED':'JSON_CODE_RECOGNIZED'};
  } catch {
    return {category:'DETAIL_UNCLASSIFIED',bodyStatus:'DETAIL_UNCLASSIFIED'};
  }
}

export async function readUbikosJson({prepareRequest,consumePayload,fetchImpl,timeoutMs,maxBytes,signal}) {
    const started=performance.now(),startedAtUtc=new Date().toISOString();
    let http=null,timer,reader,timeout=false,cancelListener,errorDetail;
    const controller=new AbortController();
    const interrupted=()=>controller.abort();
    if(signal?.aborted)controller.abort(); else signal?.addEventListener('abort',interrupted,{once:true});
    try {
      const {url,headers}=prepareRequest();
      if(controller.signal.aborted)throw fail('UBIKOS_CANCELLED');
      const operation=(async()=>{
        const response=await fetchImpl(url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers,signal:controller.signal});
        http=response.status;
        if(http>=300 && http<400)throw fail('UBIKOS_REDIRECT_DENIED');
        if(http>=400 && http<=599) {
          errorDetail={category:'DETAIL_UNCLASSIFIED',bodyStatus:'BODY_NOT_COMPLETED',
            startedAtUtc,responseReceivedAtUtc:new Date().toISOString(),requestId:null};
          // No request-id header has an approved safe format yet. Never copy a
          // provider string just because it resembles a UUID (it may reflect data).
          reader=response.body?.getReader();
          if(reader && /^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type')||'')) {
            const inspected=await inspectErrorBody(reader,Math.min(maxBytes,8192));
            if(!controller.signal.aborted)errorDetail={...errorDetail,...inspected};
          } else {
            errorDetail={...errorDetail,bodyStatus:'DETAIL_UNCLASSIFIED'};
          }
        }
        if(http===401)throw fail('UBIKOS_AUTH_REJECTED');
        // 403 alone does NOT distinguish invalid scope/key from IP policy.
        if(http===403)throw fail('UBIKOS_FORBIDDEN_AUTH_OR_IP');
        if(http===429)throw fail('UBIKOS_RATE_LIMITED');
        if(http!==200)throw fail('UBIKOS_HTTP_FAILED');
        if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get('content-type')||'')) throw fail('UBIKOS_RESPONSE_CONTRACT');
        reader=response.body?.getReader(); if(!reader)throw fail('UBIKOS_RESPONSE_CONTRACT');
        const chunks=[];let size=0;
        while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxBytes)throw fail('UBIKOS_RESPONSE_TOO_LARGE');chunks.push(part.value);}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fail('UBIKOS_RESPONSE_CONTRACT');}
        return consumePayload(payload);
      })();
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timeout=true;controller.abort();reject(fail('UBIKOS_TIMEOUT'));},timeoutMs);});
      const cancelled=new Promise((_,reject)=>{cancelListener=()=>reject(fail('UBIKOS_CANCELLED'));signal?.addEventListener('abort',cancelListener,{once:true});});
      const observation=await Promise.race([operation,deadline,cancelled]);
      return {ok:true,http,durationMs:Math.round(performance.now()-started),observation};
    } catch(error) {
      const allowed=new Set(['UBIKOS_SCOPE_REQUIRED','UBIKOS_REQUEST_CONTRACT_REQUIRED','UBIKOS_DESTINATION_DENIED','UBIKOS_CREDENTIAL_REQUIRED','UBIKOS_REDIRECT_DENIED','UBIKOS_AUTH_REJECTED','UBIKOS_FORBIDDEN_AUTH_OR_IP','UBIKOS_RATE_LIMITED','UBIKOS_HTTP_FAILED','UBIKOS_RESPONSE_CONTRACT','UBIKOS_RESPONSE_TOO_LARGE','UBIKOS_HOTEL_MISMATCH','UBIKOS_ROOM_MISMATCH','UBIKOS_CANCELLED']);
      return {ok:false,http,durationMs:Math.round(performance.now()-started),code:timeout?'UBIKOS_TIMEOUT':signal?.aborted?'UBIKOS_CANCELLED':allowed.has(error?.code)?error.code:'UBIKOS_NETWORK_OR_TRANSPORT_FAILED',
        ...(errorDetail?{errorDetail}: {})};
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',interrupted);if(cancelListener)signal?.removeEventListener('abort',cancelListener);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
}
