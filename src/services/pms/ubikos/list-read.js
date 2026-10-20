import {readUbikosJson} from './bounded-json-read.js';
import {isUbikosListDay} from './list-contract.js';
import vocabulary from './list-diagnostic-vocabulary.json' with {type:'json'};

const fail=code=>Object.assign(new Error(code),{code});
const paths=Object.freeze({checkin:'bookingscheckin',checkout:'bookingscheckout',inhouse:'bookingsinhouse'});
export function prepareUbikosListRequest(scope, apiKey) {
  const request=buildUbikosListRequest(scope);
  // Header transport cannot preserve surrounding whitespace: reject, never normalize.
  if(typeof apiKey!=='string' || !apiKey || apiKey.length>4096 || apiKey!==apiKey.trim() ||
    /[^\x21-\x7e]/.test(apiKey))throw fail('UBIKOS_CREDENTIAL_REQUIRED');
  return {url:new URL(request.url),headers:{Accept:'application/json','Content-Type':'application/json','ubikos-api-key':apiKey}};
}
export function buildUbikosListRequest({operation,date,externalHotelId='10318'}={}) {
  if(externalHotelId!=='10318' || !Object.hasOwn(paths,operation))throw fail('UBIKOS_SCOPE_REQUIRED');
  if(operation==='inhouse' ? date!==undefined : !isUbikosListDay(date))throw fail('UBIKOS_REQUEST_CONTRACT_REQUIRED');
  return Object.freeze({method:'GET',url:`https://api.ubikos.es/${paths[operation]}/10318${operation==='inhouse'?'':`/${date}`}`});
}
const type=value=>value===null?'NULL':Array.isArray(value)?'ARRAY':typeof value==='object'?'OBJECT':typeof value==='string'?'STRING':typeof value==='number'?'NUMBER':'BOOLEAN';
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const paginationNames=['pagination','paging','page','page_size','total','next','next_cursor','has_more','links'];
// Vocabulary is a disclosure allowlist, not a claim about the provider schema.
// Unknown/dynamic keys and ALL values are omitted. Never recursively copy objects.
export function inspectUbikosList(payload,{secret=null}={}) {
  const issues=new Set([`ROOT_${type(payload)}`,'COMPLETENESS_UNKNOWN','NO_LIFECYCLE_INFERENCE']);
  let pagination=false;
  const fields=(value,names,prefix)=>{
    for(const name of Object.keys(value)) {
      if(!names.includes(name) || (secret && name.includes(secret))) {issues.add('FIELD_NAMES_OMITTED');continue;}
      issues.add(`${prefix}_FIELD_${name}_${type(value[name])}`);
      if(prefix==='ENVELOPE' && paginationNames.includes(name))pagination=true;
    }
  };
  let rows=null,source=null;
  if(Array.isArray(payload)){rows=payload;source='ROOT';}
  else if(object(payload)) {
    fields(payload,vocabulary.envelopeFields,'ENVELOPE');
    const candidates=['data','items','bookings','results'].filter(name=>Array.isArray(payload[name]));
    if(candidates.length===1){source=candidates[0];rows=payload[source];}
    // Only inspect known pagination envelopes for presence; never output values.
    for(const name of ['data','pagination','paging','links']) {
      if(object(payload[name]))fields(payload[name],vocabulary.envelopeFields,'ENVELOPE');
    }
  }
  let recordCount=null;
  if(rows && rows.length>1000)issues.add('INSPECTION_LIMIT_EXCEEDED');
  else if(rows && rows.every(object)) {
    recordCount=rows.length;issues.add(`COUNT_FROM_${source}`);
    for(const row of rows)fields(row,vocabulary.recordFields,'RECORD');
  }
  if(recordCount===null)issues.add('RECORD_COUNT_UNDETERMINED');
  issues.add(pagination?'PAGINATION_INDICATORS_PRESENT':'PAGINATION_NOT_DETECTED');
  return {recordCount,issues:[...issues].sort()};
}
export function createUbikosListReader({operation,date,externalHotelId='10318',fetchImpl=globalThis.fetch,timeoutMs=10000,maxBytes=262144}={}) {
  buildUbikosListRequest({operation,date,externalHotelId});
  if(typeof fetchImpl!=='function' || !Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>30000 ||
    !Number.isInteger(maxBytes) || maxBytes<1 || maxBytes>1048576)throw fail('UBIKOS_CLIENT_CONFIG');
  return Object.freeze({read:async({apiKey,signal}={})=>{
    const result=await readUbikosJson({
      prepareRequest:()=>{
        return prepareUbikosListRequest({operation,date,externalHotelId},apiKey);
      },
      consumePayload:payload=>inspectUbikosList(payload,{secret:apiKey}),fetchImpl,timeoutMs,maxBytes,signal
    });
    // The returned result is already reduced; never expose a payload to callers.
    return {http:result.http,durationMs:result.durationMs,recordCount:result.ok?result.observation.recordCount:null,
      validation:{status:result.ok?'list_structure_inspected_not_importable':result.code,
        issues:result.ok?result.observation.issues:[],...(result.errorDetail?{errorDetail:result.errorDetail}:{})}};
  }});
}
