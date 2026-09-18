const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'staynex-ci-guards-'));
const put = (file, text) => { const target = path.join(temp, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); };
const run = args => spawnSync(process.execPath, args, { cwd: temp, env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8' });
try {
  for (const file of ['scripts/check-syntax.cjs', 'scripts/ci/run.cjs', 'scripts/ci/isolate.cjs', '.node-version']) put(file, fs.readFileSync(path.join(root, file), 'utf8'));
  for (const directory of ['src', 'shared', 'dashboard/lib', 'dashboard/app/api', 'dashboard/scripts']) fs.mkdirSync(path.join(temp, directory), { recursive: true });
  put('package.json', JSON.stringify({ type: 'module', scripts: { 'check:syntax': 'node scripts/check-syntax.cjs' } }));
  put('src/new-module.js', 'export const = ;');
  assert.notEqual(run(['scripts/check-syntax.cjs']).status, 0, 'New malformed source must fail');
  put('src/new-module.js', 'throw new Error("syntax check must not execute this");');
  assert.equal(run(['scripts/check-syntax.cjs']).status, 0, 'Valid syntax is checked without execution');
  fs.rmSync(path.join(temp, 'src'), { recursive: true });
  assert.notEqual(run(['scripts/check-syntax.cjs']).status, 0, 'Missing expected source root must fail');
  put('package.json', JSON.stringify({ scripts: { 'check:syntax': 'node -e "process.exit(23)"' } }));
  const failed = run(['scripts/ci/run.cjs', 'critical']);
  assert.equal(failed.status, 23, failed.stdout + failed.stderr);
  assert.ok(!failed.stdout.includes('CI running test:manual-send'), 'Runner must stop after failure');
  put('probe.cjs', "const fs=require('node:fs'),net=require('node:net'),assert=require('node:assert/strict');assert.equal(process.env.SEND_AUTOMATIONS,'false');assert.equal(process.env.USE_MOCK_AI,'true');assert.equal(process.env.OPENAI_API_KEY,undefined);assert.throws(()=>fs.readFileSync('.env'),e=>e.code==='ENOENT');assert.throws(()=>net.connect({host:'provider.invalid',port:443}),/CI blocked/);console.log('ISOLATION PASS');");
  put('.env', 'OPENAI_API_KEY=synthetic-must-not-load');
  put('package.json', JSON.stringify({ scripts: { 'dashboard:build': 'node probe.cjs', 'test:organization-production': 'node probe.cjs' } }));
  const result = spawnSync(process.execPath, ['scripts/ci/run.cjs', 'dashboard'], { cwd: temp, env: { ...process.env, NODE_OPTIONS: '', OPENAI_API_KEY: 'synthetic-inherited', SEND_AUTOMATIONS: 'true' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /ISOLATION PASS/);
  assert.match(result.stdout, /CI running test:organization-production/);
  console.log('CI guards PASS: new/missing sources, parse without execution, child exit 23 propagated, sanitized environment and external network blocked.');
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep + 'staynex-ci-guards-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
