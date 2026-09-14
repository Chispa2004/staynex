import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildConversationDashboard } from '../dashboard/lib/hotel-operations-workspace.js';
// The previous chronological approximation is retired. Missing durable source is never fabricated.
for (const messages of [[],[{id:'m',hotel_id:'h',conversation_id:'c',sender_type:'guest',content:'Petición',created_at:'2026-09-08T10:00:00Z'},{id:'r',hotel_id:'h',conversation_id:'c',sender_type:'ai',content:'Te paso con recepción',created_at:'2026-09-08T11:00:00Z'}]]) {
  const result=buildConversationDashboard({hotelId:'h',timezone:'Europe/Madrid',sources:{messages:{complete:true,rows:messages}}});
  assert.ok(Object.values(result.messageWorkspace.counters).every(item=>item.value===null));
  assert.equal(result.messageWorkspace.coverage,'incomplete');
  assert.deepEqual(result.messageWorkspace.pending,[]);
}
const client = readFileSync(new URL('../dashboard/components/ExecutiveDashboardClient.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../dashboard/components/AppShell.js', import.meta.url), 'utf8');
assert.match(client, /Mensajes recibidos[\s\S]*Mensajes resueltos[\s\S]*Mensajes pendientes[\s\S]*Mensajes urgentes/);
assert.match(client, /label: 'Mensajes urgentes'[^\n]*tone: 'red'/);
assert.match(client, /aria-controls="staynex-sidebar"/);
assert.match(client, /aria-expanded=\{navigation\?\.open/);
assert.match(shell, /sessionStorage\.getItem\('staynex.sidebar.collapsed'\)/);
assert.match(shell, /inert=\{!desktopNavigation && !mobileSidebarOpen\}/);
assert.match(shell, /filterNavigationByRole\(pilotNavigationGroups, activeRole, hotelContext.platformRole\)/);
assert.match(shell, /media.removeEventListener\('change', update\)/);
assert.match(client, /<h2[^\n]*tx\('Mensajes'\)/);
assert.match(client, /item\.stayStage/);
console.log('Reception message dashboard: durable-source fallback and retained shell contracts PASS');
