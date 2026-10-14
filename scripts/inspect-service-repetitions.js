import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export function inspectRepetitions(report) {
 const repetitions=[];
 for(const row of report.rows)for(let index=1;index<row.turns.length;index++) {
  const current=row.turns[index],previous=row.turns[index-1];
  if(!current.final || current.final!==previous.final)continue;
  let source='unclassified';
  if(current.outcome?.status==='needs_review')source='final_filter_tool_limitation';
  else if(current.draft?.source==='knowledge_unconfirmed')source='final_filter_insufficient_information';
  else if(current.outcome?.status==='recorded')source='postcommit_fallback';
  const raw=current.rawControlledProbe?.reply;
  repetitions.push({caseId:row.id,route:row.path,turn:current.turn,guest:current.guest,
   previousGuest:previous.guest,originalControlledProbe:raw,final:current.final,source,
   controlledProbeAlsoRepeats:Boolean(raw&&raw===previous.rawControlledProbe?.reply),
   rawIsRealModel:false,previousTicketId:previous.outcome?.ticket?.id||null,
   ticketId:current.outcome?.ticket?.id||null,draft:current.draft});
 }
 return {method:'Offline inspection of retained controlled probes; not a model evaluation',
  responses:report.rows.flatMap(r=>r.turns).filter(t=>t.final).length,
  repeatedResponses:repetitions.length,
  distinctConversationTurns:new Set(repetitions.map(r=>r.caseId+':'+r.turn)).size,
  bySource:Object.fromEntries([...new Set(repetitions.map(r=>r.source))].map(source=>[source,repetitions.filter(r=>r.source===source).length])),
  realProviderCalls:0,realModelAttribution:'unavailable',repetitions};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const input=path.join(root,'docs/evidence/fresh-service/diagnostic-final.json.gz');
 const report=JSON.parse(zlib.gunzipSync(fs.readFileSync(input)));
 const result=inspectRepetitions(report);
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
 else console.log(JSON.stringify(result,null,2));
}
