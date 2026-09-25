// Offline request preparation. Run only with an explicit private output directory.
// Provider execution uses the existing isolated runner, not application adapters.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as quality from '../shared/guest-service/quality.js';
import {STAYNEX_SYSTEM_PROMPT,buildStaynexUserPrompt} from '../src/prompts/staynex.prompt.js';
import {aiResponseJsonSchema} from '../src/schemas/ai-response.schema.js';
import {evaluationCases} from './fixtures/guest-service-quality/cases.js';
import {arrivalBookingCases} from './fixtures/guest-service-quality/arrival-booking-cases.js';
const base='5237113b98f84116fed39a72a477ab613180e079';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const source=(file,before)=>before?execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
const load=(text,bindings,names)=>new Function(...Object.keys(bindings),text.replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('export const ','const ').replaceAll('export function ','function ')+'\nreturn {'+names.join(',')+'};')(...Object.values(bindings));
const oldQuality=load(source('shared/guest-service/quality.js',true),{},['GUEST_SERVICE_POLICY','sameHotelRows','serviceContext']);
const oldPrompt=load(source('src/prompts/staynex.prompt.js',true),{...oldQuality,formatGuestMemoryForPrompt:()=> 'No hay memoria previa del huesped.'},['STAYNEX_SYSTEM_PROMPT','buildStaynexUserPrompt']);
const primary={before:oldPrompt,after:{STAYNEX_SYSTEM_PROMPT,buildStaynexUserPrompt}};
const concierge=Object.fromEntries(['before','after'].map(phase=>[phase,load(source('src/services/openai-concierge.service.js',phase==='before'),{...(phase==='before'?oldQuality:quality),isGuestMemoryEnabled:()=>false},['CONCIERGE_SYSTEM_PROMPT','buildPromptPayload','responseSchema'])]));
const inputs=[...evaluationCases,...arrivalBookingCases];
const requests=[];
for(const input of inputs)for(const phase of ['before','after']) {
 const p=primary[phase];const request={messages:[{role:'system',content:p.STAYNEX_SYSTEM_PROMPT},{role:'user',content:p.buildStaynexUserPrompt(input)}],response_format:{type:'json_schema',json_schema:{name:'staynex_ai_response',strict:true,schema:aiResponseJsonSchema}}};
 requests.push({id:input.id,phase,path:'primary',inputHash:hash(input),requestHash:hash(request),request});
}
for(const id of ['arrival-known-a','arrival-limited-b','promo-current-a','booking-request-b'])for(const phase of ['before','after']) {
 const input=inputs.find(x=>x.id===id),p=concierge[phase];const request={messages:[{role:'system',content:p.CONCIERGE_SYSTEM_PROMPT},{role:'user',content:JSON.stringify(p.buildPromptPayload(input))}],response_format:{type:'json_schema',json_schema:{name:'staynex_concierge_intelligence',strict:true,schema:p.responseSchema}}};
 requests.push({id,phase,path:'concierge',inputHash:hash(input),requestHash:hash(request),request});
}
const output=process.argv[2];if(!output || process.argv.length!==3)throw Error('Pass a private output directory');
fs.mkdirSync(output,{recursive:true});
for(const [name,value] of Object.entries({'evaluation-inputs.json':inputs,'evaluation-requests.json':requests,'evaluation-manifest.json':{base,codeSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),preparedAt:new Date().toISOString(),requestCount:requests.length,model:'runtime OPENAI_MODEL (Concierge uses AI_CONCIERGE_MODEL when present)',scope:'Prompt/schema generation only; persistence and human control use deterministic production-body tests',requestHashes:requests.map(({id,path,phase,inputHash,requestHash})=>({id,path,phase,inputHash,requestHash}))}})){
 const file=path.join(output,name);if(fs.existsSync(file))throw Error('Refuse to overwrite evidence '+file);fs.writeFileSync(file,JSON.stringify(value,null,2));
}
console.log(`Prepared ${requests.length} isolated synthetic generation requests; no provider calls`);
