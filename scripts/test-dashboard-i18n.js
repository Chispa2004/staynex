import assert from 'node:assert/strict';
import { translatePhrase } from '../dashboard/lib/i18n/translations.js';

const cases = [
  ['es', 'Hotels', 'Hoteles'],
  ['es', 'Internal Alerts', 'Alertas internas'],
  ['es', 'Reception operations', 'Operaciones de recepciÃ³n'],
  ['es', 'Experience Providers', 'Proveedores de experiencias'],
  ['fr', 'Hotels', 'HÃ´tels'],
  ['fr', 'Reception / Pre Check-in', 'RÃ©ception / PrÃ© check-in'],
  ['de', 'Hotels', 'Hotels'],
  ['de', 'Reception / Pre Check-in', 'Rezeption / Pre Check-in'],
  ['en', 'Buenos dias', 'Good morning']
];

for (const [language, source, expected] of cases) {
  assert.equal(translatePhrase(language, source), expected);
}

assert.equal(translatePhrase('fr', 'Untranslated enterprise phrase'), 'Untranslated enterprise phrase');
assert.equal(translatePhrase('de', 'Provider marketplace updated.'), 'Provider marketplace updated.');
assert.equal(translatePhrase('es', 'Retry count 2 · Status failed'), 'Reintentos 2 · Estado failed');

console.log('dashboard i18n checks passed');

