import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createOnboardingStore } from './fixtures/onboarding-store.js';
import * as navigation from '../dashboard/lib/onboarding-navigation.js';
import * as permissions from '../dashboard/lib/permissions.js';
import * as pilot from '../dashboard/lib/pilot-onboarding.js';
import * as location from '../shared/location/hotel-location-integrity.js';
import * as pms from '../shared/pms/safe-connection.js';
import { buildReadinessForHotel } from '../dashboard/lib/golive-readiness.js';
import * as health from '../dashboard/lib/system-health.js';
import * as styles from '../dashboard/lib/ui/styles.js';
import { translatePhrase } from '../dashboard/lib/i18n/translations.js';

const require = createRequire(new URL('../dashboard/package.json', import.meta.url));
const swc = require('next/dist/build/swc');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const compile = async (path, mocks = {}, extra = '') => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8') + extra;
  const output = await swc.transform(source, { filename: path, jsc: { parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output.code)(id => mocks[id] || require(id), module, module.exports);
  return module.exports;
};
const { shouldRedirectToOnboarding: redirect, getOnboardingAction: action } = navigation;
for (const pathname of navigation.ONBOARDING_DESTINATIONS) {
  assert.equal(redirect({ pathname, role: 'admin', completed: false }), false);
  assert.equal(redirect({ pathname, role: 'admin', completed: true }), false);
}
for (const pathname of ['/dashboard', '/dashboard/analytics', '/dashboard/settings/users/other', '/dashboard/settings/pms/unsafe']) {
  assert.equal(redirect({ pathname, role: 'admin', completed: false }), true);
}
assert.equal(redirect({ pathname: '/platform/hotels', role: 'admin', completed: false }), false);
assert.equal(action('users', { role: 'manager' }).href, undefined);
assert.equal(action('pms', { role: 'manager' }).href, undefined);
assert.equal(action('users', { role: 'admin', fallback: true }).href, undefined);
assert.equal(action('users', { role: 'admin', platformRole: 'support' }).href, undefined);
assert.equal(permissions.canAccessRouteForContext('receptionist', '/dashboard/settings/users'), false);
assert.equal(action('knowledge', { role: 'manager' }).href, '/dashboard/knowledge');
console.log('PASS explicit destinations and real role permissions; no prefix bypass');

const store = createOnboardingStore();
const currentHotel = { getCurrentHotelForRequest: store.context };
const audit = { writeEnterpriseAuditLog: async () => {} };
const next = { NextResponse: { json: (body, options) => Response.json(body, options) } };
const onboarding = await compile('../dashboard/lib/onboarding.js', {
  './current-hotel': currentHotel, './pilot-onboarding.js': pilot,
  '../../shared/pms/safe-connection.js': pms, './system-health.js': health
});
const stateRoute = await compile('../dashboard/app/api/onboarding/state/route.js', {
  'next/server': next, '@/lib/onboarding': onboarding, '@/lib/pilot-onboarding': pilot, '@/lib/enterprise-audit': audit
});
const usersRoute = await compile('../dashboard/app/api/settings/users/route.js', {
  'next/server': next, '@/lib/current-hotel': currentHotel, '@/lib/permissions': permissions
});
const hotelRoute = await compile('../dashboard/app/api/onboarding/hotel/route.js', {
  'next/server': next, '@/lib/current-hotel': currentHotel, '@/lib/enterprise-audit': audit,
  '../../../../../shared/location/hotel-location-integrity.js': location
});
const request = (method = 'GET', body, hotelId = 'hotel-onboarding-a') => new Request('http://localhost/api/test', {
  method, headers: { 'content-type': 'application/json', 'x-staynex-hotel-id': hotelId },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const read = async () => (await stateRoute.GET(request())).json();
let result = await read();
assert.equal(result.pilot.blocks.find(row => row.id === 'users').readyForConfiguration, false);
const before = structuredClone(store.tables);
await usersRoute.GET(request());
assert.deepEqual(store.tables, before, 'opening Users does not complete or modify anything');
store.failNextWrite = true;
assert.equal((await usersRoute.PATCH(request('PATCH', { id: 'assignment-a', status: 'active' }))).status, 500);
assert.equal((await read()).pilot.blocks.find(row => row.id === 'users').readyForConfiguration, false);
assert.equal((await usersRoute.PATCH(request('PATCH', { id: 'assignment-a', status: 'active' }))).status, 200);
assert.equal((await read()).pilot.blocks.find(row => row.id === 'users').readyForConfiguration, true);
assert.equal((await read()).state.onboarding_completed, false);
assert.equal(store.tables.hotel_onboarding_state[0].completed_steps.length, 0);
console.log('PASS real Users handler -> persisted store -> real onboarding loader; failure/retry and fresh read');

const other = structuredClone(store.tables.hotel_users[1]);
assert.equal((await usersRoute.PATCH(request('PATCH', { id: 'assignment-b', status: 'disabled' }))).status, 404);
assert.deepEqual(store.tables.hotel_users[1], other);
assert.equal((await usersRoute.GET(request('GET', null, 'hotel-onboarding-b'))).status, 403);
for (const role of ['manager', 'receptionist', 'blocked']) {
  store.role = role;
  assert.equal((await usersRoute.GET(request())).status, 403);
  assert.equal((await usersRoute.PATCH(request('PATCH', { id: 'assignment-a', status: 'disabled' }))).status, 403);
}
store.role = 'admin';
assert.equal((await hotelRoute.PATCH(request('PATCH', { hotelId: 'hotel-onboarding-b', name: 'Attack' }))).status, 403);
const oldNumber = store.tables.hotels[0].whatsapp_number;
store.failNextWrite = true;
assert.equal((await hotelRoute.PATCH(request('PATCH', { whatsapp_number: '+34000000000' }))).status, 400);
assert.equal(store.tables.hotels[0].whatsapp_number, oldNumber);
assert.equal((await hotelRoute.PATCH(request('PATCH', { whatsapp_number: '+34000000000' }))).status, 200);
result = await read();
assert.equal(result.pilot.blocks.find(row => row.id === 'whatsapp').readyForConfiguration, true);
assert.equal(result.pilot.readyForLiveAutomations, false);
assert.equal(result.pilot.readyForGoLive, false);
assert.equal(store.tables.hotels[0].ai_auto_reply_enabled, false);
assert.deepEqual(store.tables.hotels[0].metadata, {});
console.log('PASS hotel/role isolation, hotel save recovery and unchanged live/AI guards');

const view = await compile('../dashboard/components/onboarding/OnboardingWizard.js', {
  'next/navigation': {}, './StepHotelSetup': {}, '@/components/ExecutiveCard': {}, '@/lib/auth-headers': {},
  '@/lib/theme/useDashboardTheme': {}, '@/lib/ui/styles': styles, '@/lib/onboarding-navigation': navigation,
  '@/lib/i18n/useDashboardLanguage': { useDashboardLanguage: () => ({ tx: value => translatePhrase('es', value) }) },
  'next/link': ({ children, ...props }) => React.createElement('a', props, children)
}, '\nexport { BlockAction };');
const renderAction = (id, role) => renderToStaticMarkup(React.createElement(view.BlockAction, {
  block: { id }, access: { role }, isLight: true, onSelectStep() {}
}));
assert(renderAction('users', 'admin').includes('href="/dashboard/settings/users"'));
assert(!renderAction('users', 'manager').includes('<a'));
assert(renderAction('users', 'manager').includes('administrador del hotel'));
assert(renderAction('failure_rehearsal', 'admin').includes('No se acredita pulsando un botón'));
assert(renderAction('knowledge', 'admin').includes('Configurar información del hotel'));
assert(renderAction('whatsapp', 'admin').includes('Guardar el número no verifica'));
assert.equal(translatePhrase('es', 'Pilot Readiness'), 'Preparación del hotel');
const platform = navigation.getPlatformReadinessAction;
assert.equal(platform('users_configured').href, '#hotel-users');
assert.equal(platform('whatsapp_connected').href, '#hotel-whatsapp');
assert(!platform('gdpr_cleanup_ready').href);
assert(platform('gdpr_cleanup_ready').help.includes('autorización separadas'));
console.log('PASS rendered actions, permission explanation, real destinations and external dependencies');

const detailView = await compile('../dashboard/components/PlatformHotelDetailClient.js', {
  'next/navigation': {}, '@/lib/supabase-browser': {}, '@/lib/workspace-context': {},
  '@/lib/theme/useDashboardTheme': {}, '@/lib/ui/styles': styles,
  './PremiumEmptyState': {}, './ExperienceProvidersPanel': {},
  '@/lib/onboarding-navigation': navigation,
  '@/lib/i18n/useDashboardLanguage': { useDashboardLanguage: () => ({ tx: value => translatePhrase('es', value) }) }
}, '\nexport { GoLiveReadinessPanel };');
const readiness = buildReadinessForHotel({hotel:store.tables.hotels[0],users:[]});
const detailHtml = renderToStaticMarkup(React.createElement(detailView.GoLiveReadinessPanel, {
 readiness,isLight:true,liveModeEnabled:false,saving:false,onEnable(){throw new Error('must not activate');}
}));
assert(detailHtml.includes('href="#hotel-users"'));
assert(detailHtml.includes('href="#hotel-pms"'));
assert(detailHtml.includes('autorización separadas'));
assert(detailHtml.includes('disabled=""'), 'live activation remains disabled');
for(const check of readiness.checks)assert(navigation.getPlatformReadinessAction(check.check_type).help);
console.log('PASS actual Platform readiness rendering, per-requirement next steps and disabled live control');

const pmsView = await compile('../dashboard/components/PmsProviderCard.js', {
 '@/lib/theme/useDashboardTheme': {useDashboardTheme:()=>({theme:'light'})},
 '@/lib/i18n/useDashboardLanguage': {useDashboardLanguage:()=>({tx:value=>translatePhrase('es',value)})},
 './ExecutiveCard': {ExecutiveCard:({children})=>React.createElement('div',null,children),ExecutiveBadge:({children})=>React.createElement('span',null,children)}
});
const pmsHtml = renderToStaticMarkup(React.createElement(pmsView.PmsProviderCard, {
 provider:{key:'synthetic',name:'PMS sintético',configurationMode:'live_api'},
 connection:{enabled:true,has_client_secret:true,sync_status:'configured'}, canManage:false
}));
assert(pmsHtml.includes('Configurado; sin verificar'));
assert(!pmsHtml.includes('>Connected<'));
assert(pmsHtml.includes('Comprobar conexión'));
assert(pmsHtml.includes('Un administrador del hotel'));
console.log('PASS actual PMS card: configuration is not verification; management remains disabled');

const knowledgeView = await compile('../dashboard/components/KnowledgeBaseEditor.js', {
 '@/lib/theme/useDashboardTheme':{useDashboardTheme:()=>({theme:'light'})},
 '@/lib/i18n/useDashboardLanguage':{useDashboardLanguage:()=>({t:key=>key,tx:value=>translatePhrase('es',value)})},
 '@/lib/auth-headers':{}, '@/lib/tenant-client':{}
});
const knowledgeHtml=renderToStaticMarkup(React.createElement(knowledgeView.KnowledgeBaseEditor));
assert(knowledgeHtml.includes('aria-label="Buscar información del hotel"'));
assert(knowledgeHtml.includes('aria-label="Filtrar por categoría"'));
console.log('PASS real Knowledge rendering with accessible navigation fields');
