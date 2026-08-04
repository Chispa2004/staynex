import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const dashboardRoot = join(repoRoot, 'dashboard');
const nextDir = join(dashboardRoot, '.next');
const nextConfigPath = join(dashboardRoot, 'next.config.mjs');

const normalizePath = (value) => String(value || '').replace(/\\/g, '/');

const walk = (dir, { ignoredDirs = new Set() } = {}) => {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (!entry.isDirectory()) {
      return [fullPath];
    }

    return ignoredDirs.has(entry.name) ? [] : walk(fullPath, { ignoredDirs });
  });
};

const readText = (file) => readFileSync(file, 'utf8');

const nextConfig = readText(nextConfigPath);
assert.match(
  nextConfig,
  /const repoRoot = resolve\(dashboardRoot, '\.\.'\);/,
  'dashboard next.config.mjs should derive the repository root from the dashboard directory'
);
assert.match(
  nextConfig,
  /outputFileTracingRoot:\s*repoRoot/,
  'dashboard build should trace files from the repository root'
);
assert.doesNotMatch(
  nextConfig,
  /[A-Z]:\\Users\\|\/Users\//,
  'dashboard next.config.mjs must not hardcode a local absolute path'
);

assert.ok(existsSync(nextDir), 'Run npm run dashboard:build before shared tracing verification');

const traceFiles = walk(nextDir).filter((file) => file.endsWith('.nft.json'));
assert.ok(traceFiles.length > 0, 'Next build should emit file tracing manifests');

const automationApiTraceFiles = traceFiles.filter((file) => (
  normalizePath(relative(nextDir, file)).includes('server/app/api/automations/')
));
assert.ok(automationApiTraceFiles.length > 0, 'Automation API routes should emit trace manifests');

const traceEntriesByFile = new Map(traceFiles.map((file) => {
  const parsed = JSON.parse(readText(file));
  return [
    file,
    (parsed.files || []).map((entry) => normalizePath(entry))
  ];
}));

const sharedRuntimeFiles = [
  'shared/automations/catalog.js',
  'shared/automations/runtime.js',
  'shared/automations/queue-writer.js'
];
const hasTraceEntry = (entries, expected) => (
  entries.some((entry) => entry.endsWith(expected) || entry.includes(`/${expected}`))
);
const automationApiEntries = automationApiTraceFiles.flatMap((file) => traceEntriesByFile.get(file) || []);
const resolveTraceEntry = (traceFile, entry) => resolve(dirname(traceFile), entry);
const tracedServerArtifacts = automationApiTraceFiles.flatMap((traceFile) => (
  (traceEntriesByFile.get(traceFile) || [])
    .map((entry) => resolveTraceEntry(traceFile, entry))
    .filter((file) => existsSync(file))
    .filter((file) => normalizePath(relative(nextDir, file)).startsWith('server/'))
    .filter((file) => ['.js', '.json'].includes(extname(file)))
));
const automationApiServerArtifacts = automationApiTraceFiles
  .map((file) => file.replace(/\.nft\.json$/, ''))
  .filter((file) => existsSync(file))
  .concat(tracedServerArtifacts);
const automationApiServerSource = automationApiServerArtifacts.map(readText).join('\n');
const serverArtifactMarkers = {
  'shared/automations/catalog.js': 'automation-runtime-foundation-phase1',
  'shared/automations/runtime.js': 'stable triggerOccurrence is required to build automation idempotencyKey',
  'shared/automations/queue-writer.js': 'supabase client is required to write automation decisions'
};
const sharedRuntimeInclusion = Object.fromEntries(sharedRuntimeFiles.map((sharedFile) => [
  sharedFile,
  {
    traced: hasTraceEntry(automationApiEntries, sharedFile),
    bundledInServerRoute: automationApiServerSource.includes(serverArtifactMarkers[sharedFile])
  }
]));

sharedRuntimeFiles.forEach((sharedFile) => {
  assert.ok(
    sharedRuntimeInclusion[sharedFile].traced || sharedRuntimeInclusion[sharedFile].bundledInServerRoute,
    `Automation API server artifacts should include ${sharedFile}`
  );
});

const dashboardSourceFiles = walk(dashboardRoot, { ignoredDirs: new Set(['.next', 'node_modules']) })
  .filter((file) => ['.js', '.jsx', '.mjs', '.ts', '.tsx'].includes(extname(file)));
const clientWriterImports = dashboardSourceFiles.filter((file) => {
  const source = readText(file);
  return /^['"]use client['"];?/m.test(source.trimStart())
    && /automation-queue-writer|shared\/automations\/queue-writer|writeAutomationDecisionToQueue/.test(source);
});
assert.deepEqual(
  clientWriterImports.map((file) => normalizePath(relative(repoRoot, file))),
  [],
  'Client components must not import the server-only queue writer'
);

const staticDir = join(nextDir, 'static');
const staticFiles = walk(staticDir).filter((file) => statSync(file).isFile());
const clientBundleExtensions = new Set(['.js', '.json', '.html', '.map']);
const clientBundleFiles = staticFiles.filter((file) => clientBundleExtensions.has(extname(file)));
const forbiddenClientMarkers = [
  'automation-queue-writer',
  'shared/automations/queue-writer',
  'writeAutomationDecisionToQueue',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TWILIO_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'APALEO_CLIENT_SECRET',
  'UBIKOS_PASSWORD'
];
const clientLeaks = clientBundleFiles.flatMap((file) => {
  const source = readText(file);
  return forbiddenClientMarkers
    .filter((marker) => source.includes(marker))
    .map((marker) => `${normalizePath(relative(dashboardRoot, file))}:${marker}`);
});
assert.deepEqual(clientLeaks, [], 'Client bundles must not contain server writer or secret markers');

console.log(JSON.stringify({
  ok: true,
  traceFiles: traceFiles.length,
  automationApiTraceFiles: automationApiTraceFiles.length,
  sharedRuntimeInclusion,
  clientBundleFiles: clientBundleFiles.length
}, null, 2));
