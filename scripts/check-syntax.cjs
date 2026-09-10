const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (process.argv.length !== 2) throw new Error('check:syntax takes no arguments');
const roots = ['src', 'shared', 'scripts', 'dashboard/lib', 'dashboard/app/api', 'dashboard/scripts'];
// These two .js files contain JSX. Next build validates them with the UI.
const jsx = new Set(['dashboard/lib/i18n/useDashboardLanguage.js', 'dashboard/lib/theme/useDashboardTheme.js']);
const files = [];
const walk = directory => {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${file}`);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:[cm]?js)$/.test(file) && !jsx.has(file)) files.push(file);
  }
};
roots.forEach(walk);
for (const entry of fs.readdirSync(path.join(root, 'dashboard'), { withFileTypes: true })) {
  if (entry.isFile() && /\.[cm]?js$/.test(entry.name)) files.push(`dashboard/${entry.name}`);
}
if (!files.length) throw new Error('No JavaScript sources found');
let checked = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  checked++;
}
console.log(`Syntax PASS: ${checked} JS/CJS/MJS files checked individually. JSX/pages/components require dashboard:build. No code executed.`);
