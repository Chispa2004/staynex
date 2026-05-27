import assert from 'node:assert/strict';
import { translatePhrase } from '../dashboard/lib/i18n/translations.js';

const cases = [
  ['es', 'Monitoring', 'Monitorización'],
  ['es', 'Logout', 'Cerrar sesión'],
  ['es', 'Hotels', 'Hoteles'],
  ['es', 'Staynex SaaS console', 'Consola SaaS Staynex'],
  ['es', 'Platform operations', 'Operaciones Platform'],
  ['es', 'Internal AI QA', 'QA interna de IA'],
  ['es', 'Failure Intelligence', 'Failure Intelligence'],
  ['es', 'Total hotels', 'Hoteles totales'],
  ['es', 'Need attention', 'Necesitan atención'],
  ['es', 'Reservations', 'Reservas'],
  ['es', 'AI conversations', 'Conversaciones IA'],
  ['es', 'Revenue generated', 'Revenue generado'],
  ['es', 'PMS connected', 'PMS conectados'],
  ['es', 'Experience catalog', 'Catálogo de experiencias'],
  ['es', 'WhatsApp ready', 'WhatsApp listo'],
  ['es', 'Create Hotel Workspace', 'Crear workspace de hotel'],
  ['es', 'Open AI Quality', 'Abrir AI Quality'],
  ['es', 'Reception operations', 'Operaciones de recepción'],
  ['es', 'Experience Providers', 'Proveedores de experiencias'],
  ['fr', 'Hotels', 'Hôtels'],
  ['fr', 'Reception / Pre Check-in', 'Réception / Pré check-in'],
  ['de', 'Hotels', 'Hotels'],
  ['de', 'Reception / Pre Check-in', 'Rezeption / Pre Check-in'],
  ['en', 'Buenos dias', 'Good morning']
];

for (const [language, source, expected] of cases) {
  assert.equal(translatePhrase(language, source), expected);
}

const esSmoke = [
  translatePhrase('es', 'Monitoring'),
  translatePhrase('es', 'Logout'),
  translatePhrase('es', 'Staynex SaaS console'),
  translatePhrase('es', 'Platform Monitoring'),
  translatePhrase('es', 'Provider Monitoring'),
  translatePhrase('es', 'Tenant workspaces')
].join(' ');

assert(!esSmoke.includes('?'), 'Spanish UI must not contain mojibake ?');
assert(!esSmoke.includes('?'), 'Spanish UI must not contain mojibake ?');
assert(!esSmoke.includes('sesi??n'), 'Spanish logout must not be mojibake');
assert(!esSmoke.includes('Monitorizaci??n'), 'Spanish monitoring must not be mojibake');
assert(!esSmoke.includes('undefined'), 'Translations must not expose undefined');

assert.equal(translatePhrase('fr', 'Untranslated enterprise phrase'), 'Untranslated enterprise phrase');
assert.equal(translatePhrase('de', 'Provider marketplace updated.'), 'Provider marketplace updated.');
assert.equal(translatePhrase('es', 'Retry count 2 ' + String.fromCharCode(0xb7) + ' Status failed'), 'Reintentos 2 ' + String.fromCharCode(0xb7) + ' Estado failed');
assert.equal(translatePhrase('es', '3 active'), '3 activos');
assert.equal(translatePhrase('es', '4 of 7 hotels'), '4 de 7 hoteles');

console.log('dashboard i18n checks passed');
