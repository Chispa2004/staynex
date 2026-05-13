import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = dirname(scriptDir);
const nextDir = join(dashboardRoot, '.next');

await rm(nextDir, {
  recursive: true,
  force: true
});

console.log('Next cache cleaned');
