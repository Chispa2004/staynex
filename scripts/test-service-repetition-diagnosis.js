import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {inspectRepetitions} from './inspect-service-repetitions.js';
import {finalizeServiceReply} from '../shared/guest-service/quality.js';

const retained=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../docs/evidence/fresh-service/diagnostic-final.json.gz',import.meta.url))));
const diagnosis=inspectRepetitions(retained);
assert.equal(diagnosis.responses,90);assert.equal(diagnosis.repeatedResponses,14);
assert.equal(diagnosis.distinctConversationTurns,7);
assert.deepEqual(diagnosis.bySource,{final_filter_insufficient_information:8,final_filter_tool_limitation:4,postcommit_fallback:2});
assert(diagnosis.repetitions.every(r=>!r.controlledProbeAlsoRepeats&&!r.rawIsRealModel));
// A changed probe is not a changed model rate. Missing text/control blocks cannot
// create false repetitions, and the count must change when a retained reply does.
const modified=structuredClone(retained),candidate=modified.rows.find(r=>r.id==='D06'&&r.path==='primary');
candidate.turns[2].final='Different controlled response';
assert.equal(inspectRepetitions(modified).repeatedResponses,13);
assert.equal(inspectRepetitions({rows:[{turns:[{final:null},{final:null}]}]}).repeatedResponses,0);

const common={hotel:{id:'h'},hotelId:'h',guestId:'g',conversationId:'c',language:'en',
 context:{hotelKnowledge:[],recentMessages:[]},operationalRequest:{status:'not_requested'}};
const unknown=message=>finalizeServiceReply({...common,message,primary:{reply:'Controlled, unsupported answer'}}).reply;
// The retained diagnosis above stays unchanged. The corrected finalizer now
// describes the particular unknown instead of repeating the generic fallback.
assert.notEqual(unknown('Where is the gym?'),unknown('When is the pool open?'));
const multi=message=>finalizeServiceReply({...common,message,primary:{reply:'A different raw probe'},
 operationalRequest:{status:'needs_review',errorCode:'MULTIPLE_REQUESTS_REQUIRE_REVIEW'}}).reply;
assert.notEqual(multi('Which request is being handled?'),multi('Please keep both requests visible.'));
assert.doesNotMatch(multi('Which request is being handled?'),/are (?:both )?in progress|have recorded both/);

const ticket={id:'t',hotel_id:'h',guest_id:'g',conversation_id:'c',status:'open',category:'reception',description:'Review a charge',request_context:{request_key:'billing_review'}};
const receipt=finalizeServiceReply({...common,message:'Review a charge',primary:{reply:'Variable original answer'},
 ticket,receiptReply:null,operationalRequest:{status:'recorded',ticket,sourceMessageId:'m'}});
assert.equal(receipt.service_quality.receipt_generation,false);
assert.equal(receipt.service_quality.notification_confirmed,false);

const plan=JSON.parse(fs.readFileSync(new URL('./fixtures/guest-service-quality/naturalness-evaluation-plan.json',import.meta.url)));
assert.equal(plan.heldout.length,4);assert.equal(new Set(plan.heldout.map(c=>c.id)).size,4);
assert(plan.heldout.every(c=>['a','b'].includes(c.hotel)&&c.turns.length===4));
assert.equal(plan.diagnosticTurns,plan.diagnosticIds.length*3+plan.diagnosticVariants.length);
const attempts=(plan.diagnosticTurns*2+plan.heldout.reduce((n,c)=>n+c.turns.length,0))*5;
assert.equal(attempts,plan.maximumPlannedAttempts);assert(attempts<=plan.limits.maxProviderAttempts);
assert.equal(plan.realBaseline,null);assert.equal(plan.realAfter,null);
const facts=fs.readFileSync(new URL('./fixtures/guest-service-quality/fresh-service-evaluation.json',import.meta.url),'utf8').replaceAll('\r\n','\n');
assert.equal(createHash('sha256').update(facts).digest('hex'),plan.hotelFactsCanonicalSha256);
console.log('PASS retained diagnosis provenance, corrected finalizer, safe unconfirmed receipt and original frozen plan (N01-N04 now diagnostic); no model or database calls');
