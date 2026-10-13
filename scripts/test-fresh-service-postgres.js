import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

// Same frozen cases and evaluator as the retained baseline. A failed property
// must fail CI, even though the evaluation command retains unfavorable outputs.
const directory=path.resolve('.npm-cache/fresh-service-evaluation');
fs.mkdirSync(directory,{recursive:true});
for(const split of ['diagnostic','holdout','validation','naturalness-reserved','naturalness-final']) {
 const output=path.join(directory,split+'.json');
 execFileSync(process.execPath,['scripts/evaluate-fresh-service.js',split,output],{env:process.env,stdio:'inherit'});
 const report=JSON.parse(fs.readFileSync(output,'utf8'));
 assert.equal(report.datasetCanonicalHash,'3495b626641a8339dbe506498033b59c10eb95d67891bcf4b2d531e63f04b43c');
 assert.equal(report.realCalls,0);assert.deepEqual(report.externalAttempts,[]);
 assert.deepEqual(report.failures,{},'Service evidence contract failed; retain '+output);
 console.log(`PASS ${split}: ${report.conversations} conversations, ${report.routeTurns} routed turns, real PostgreSQL`);
}
