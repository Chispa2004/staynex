import fs from 'node:fs';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
const dir=new URL('../docs/evidence/service-naturalness-correction/',import.meta.url);
const baseline=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../docs/evidence/fresh-service/diagnostic-final.json.gz',import.meta.url))));
const after=JSON.parse(fs.readFileSync(new URL('../.npm-cache/fresh-service-evaluation/diagnostic.json',import.meta.url)));
assert.equal(after.datasetCanonicalHash,baseline.datasetCanonicalHash);
const turns=r=>r.rows.flatMap(row=>row.turns),replies=r=>turns(r).filter(t=>t.final);
function metrics(r){return {routedTurns:turns(r).length,responses:replies(r).length,
 repeatedResponses:replies(r).filter(t=>t.styleSignals.repeatsPrevious).length,
 eligibleConsecutivePairs:r.rows.reduce((n,row)=>n+row.turns.slice(1).filter((t,i)=>t.final&&row.turns[i].final).length,0),
 operationalFailedProperties:r.failures,over50Words:replies(r).filter(t=>t.styleSignals.words>50).length,
 realCalls:r.realCalls,realTokens:r.realTokens,externalAttempts:r.externalAttempts};}
const comparison=[];
for(const row of baseline.rows) {
 const updated=after.rows.find(r=>r.id===row.id&&r.path===row.path);assert(updated);
 assert.equal(updated.hotel,row.hotel);assert.equal(updated.phase,row.phase);
 for(const [i,t] of row.turns.entries()) {
  const next=updated.turns[i];assert.equal(t.guest,next.guest);
  if(i===0){assert.equal(t.before.length,0);assert.equal(next.before.length,0);}
  let transformation=next.transformation?.transformation||'unknown';
  if(transformation==='generation'&&next.final!==(next.conciergeResponse?.result?.suggested_response||next.modelResponse?.reply))transformation='safety_or_grounding';
  comparison.push({id:row.id,route:row.path,turn:t.turn,guest:t.guest,
   originalIsRealModel:false,controlledOriginal:next.rawControlledProbe,conciergeOriginal:next.conciergeResponse,
   before:t.final,after:next.final,transformation,
   operationalEvidence:next.outcome,draftBefore:t.draft,draftAfter:next.draft,failures:next.failures});
 }
}
const result={method:'Same frozen synthetic conversations and initial empty ticket state; controlled SDK probes, real local PostgreSQL; NOT a real-model comparison',before:metrics(baseline),after:metrics(after),comparison};
fs.writeFileSync(new URL('diagnostic-comparison.json',dir),JSON.stringify(result,null,2)+'\n');
const ids=['D06','D07','D10','D14','D16','D02'];
const lines=['# Seis conversaciones completas: antes y después','',
'Motor anterior: `852eeb0`. Comparación con dobles controlados y PostgreSQL desechable. **Cero llamadas reales nuevas.** Se transcriben las respuestas finales sin editar; los prompts, salidas sustituidas y resultados SQL están en los JSON completos. No equivalen a una valoración humana de naturalidad.',''];
for(const id of ids) {
 const row=baseline.rows.find(r=>r.id===id&&r.path==='primary');
 lines.push('## '+id+' — '+row.hotel,'');
 if(id==='D02')lines.push('**Residual desfavorable:** respuesta inicial extensa, advertencias redundantes y pregunta por una fecha ya indicada con el mes escrito. La llegada nocturna sigue necesitando confirmación; no se declara resuelto este defecto de pertinencia.','');
 for(const t of comparison.filter(t=>t.id===id&&t.route==='primary'))lines.push('**Huésped:** '+t.guest,'','**Antes:** '+t.before,'','**Después:** '+t.after,'');
 const concierge=comparison.filter(t=>t.id===id&&t.route==='concierge');
 lines.push(concierge.every((t,i)=>t.after===comparison.filter(t=>t.id===id&&t.route==='primary')[i].after)?'Concierge: mismos textos finales en estos turnos.':'Concierge: consultar diferencias completas en el JSON; no se unifican artificialmente.','');
}
fs.writeFileSync(new URL('six-before-after.md',dir),lines.join('\n').trimEnd()+'\n');
console.log(JSON.stringify({before:result.before,after:result.after}));
