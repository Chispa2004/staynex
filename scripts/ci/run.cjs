const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const expected = fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim();
if (process.versions.node !== expected) throw new Error(`CI requires Node ${expected}; found ${process.versions.node}`);
const modes = {
  critical: ['check:syntax', 'test:ci-guards', 'test:manual-send', 'test:automation-dispatch-contract', 'test:inbox', 'test:auth-hotel-context', 'test:organization-access', 'test:post-login-routing', 'test:messages-tenant-isolation', 'test:pilot-human-safety', 'test:translation-knowledge-isolation', 'test:demo-external-isolation', 'test:automation-runtime-foundation', 'test:automation-runtime-phase2a1', 'test:automation-runtime-phase2a2', 'test:http-security'],
  dashboard: ['dashboard:build'],
  postgres: ['test:knowledge-isolation-postgres', 'test:automation-dispatch-postgres', 'test:organization-postgres']
};
const tasks = modes[process.argv[2]];
if (!tasks || process.argv.length !== 3) throw new Error('Expected critical, dashboard or postgres');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(key)));
Object.assign(env, { CI: 'true', NEXT_TELEMETRY_DISABLED: '1', SEND_AUTOMATIONS: 'false', USE_MOCK_AI: 'true',
  GUEST_MEMORY_ENABLED: 'false', AUTOMATION_TEST_SEND_ENABLED: 'false',
  NODE_OPTIONS: `--require "${path.join(__dirname, 'isolate.cjs').replaceAll('\\', '/')}"` });
// npm_execpath is supplied by npm on all supported platforms; direct invocation
// also works for the standard Node distribution. No shell command composition.
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!fs.existsSync(npm)) throw new Error('Run this entry point through npm');
for (const task of tasks) {
  console.log(`\nCI running ${task}`);
  const result = spawnSync(process.execPath, [npm, 'run', task], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
