import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluationBudget} from './fixtures/guest-service-quality/evaluation-budget.js';
const plan=JSON.parse(fs.readFileSync(new URL('./fixtures/guest-service-quality/precision-real-plan.json',import.meta.url)));
const reserve=fs.readFileSync(new URL('./fixtures/guest-service-quality/arrival-naturalness-real-reserve.json',import.meta.url),'utf8').replaceAll('\r\n','\n');
assert.equal(createHash('sha256').update(reserve).digest('hex'),plan.reservedCanonicalSha256);
assert.throws(()=>evaluationBudget(plan).reserve(10),/not approved/);
const full=evaluationBudget(plan,{approvedUsd:.75});
for(let n=0;n<114;n++){assert.equal(full.reserve(12000).maxRetries,0);full.settle({prompt_tokens:12000,completion_tokens:1000,total_tokens:13000});}
assert.equal(full.snapshot().usd,.7296);assert.equal(full.snapshot().tokens,1482000);assert.throws(()=>full.reserve(1),/ceiling/);
for(const usage of [null,{prompt_tokens:12001,completion_tokens:1,total_tokens:12002},{prompt_tokens:2,completion_tokens:3,total_tokens:99}]){
 const gate=evaluationBudget(plan,{approvedUsd:.75});gate.reserve(12000);assert.throws(()=>gate.settle(usage));assert.equal(gate.snapshot().stopped,true);assert.throws(()=>gate.reserve(1));
}
const gate=evaluationBudget(plan,{approvedUsd:.001});assert.throws(()=>gate.reserve(12000),/ceiling/);
const errors=evaluationBudget(plan,{approvedUsd:.75});assert.throws(()=>errors.reserve(12001),/Input bound/);errors.reserve(12000);assert.throws(()=>errors.reserve(1),/unsettled/);assert.throws(()=>errors.settle(null,'401'),/no retry/);assert.equal(errors.snapshot().usd,.0064);
console.log('PASS offline monetary gate: approval, full input/output reservation, max calls/tokens/USD, unknown usage, provider error, no retries and unchanged held-out hash; zero provider calls');
