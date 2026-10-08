import {test,expect} from '@playwright/test';
import {buildConversationDashboard} from '../dashboard/lib/hotel-operations-workspace.js';
import {attentionDashboardDTO} from '../shared/message-attention/contract.js';
const a='1ef60a40-b65f-4bff-9bd3-22654e5029f2',b='00000000-0000-4000-8000-000000000002';
const hotel=id=>({id,name:id===a?'Hotel QA demo · datos sintéticos':'Hotel B sintético',timezone:'Europe/Madrid',healthStatus:'Onboarding',stats:{},readiness:{}});
async function prepare(page,{pending=false}={}) {
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('**/api/platform/hotels',route=>route.fulfill({json:{hotels:[hotel(a),hotel(b)],metrics:{totalHotels:2}}}));
  await page.route('**/api/platform/hotels/*/support',route=>{
    const id=new URL(route.request().url()).pathname.split('/').at(-2);
    return route.fulfill({json:{ok:true,readonly:true,hotel:hotel(id),supportSession:{hotelId:id,hotelName:hotel(id).name,readonly:true}}});
  });
  await page.route('**/api/current-hotel',async route=>{
    const response=await route.fetch(),base=await response.json(),headers=route.request().headers();
    const id=headers['x-staynex-hotel-id']||a;
    const platform=headers['x-staynex-workspace-path']?.startsWith('/platform');
    await route.fulfill({json:{...base,hotel:platform?null:hotel(id),role:platform?'blocked':'admin',platformRole:'platform_admin',permissions:platform?[]:base.permissions,
      accessDenied:platform,accessDeniedReason:platform?'workspace_required':null,directoryDeferred:false,canSwitchWorkspaces:false,
      onboardingGate:platform?null:{hotelId:id,completed:!pending}}});
  });
  await page.route('**/api/onboarding/state',async route=>{
    const response=await route.fetch(),body=await response.json();
    await route.fulfill({json:{...body,state:{...body.state,hotel_id:route.request().headers()['x-staynex-hotel-id']||a,onboarding_completed:!pending}}});
  });
  // The second hotel's data transport is deliberately empty, not copied from A.
  await page.route('**/api/executive-dashboard?*',async route=>{
    if(route.request().headers()['x-staynex-hotel-id']!==b)return route.continue();
    await route.fulfill({json:{hotel:hotel(b),role:'admin',permissions:[],conversationDashboard:buildConversationDashboard({hotelId:b,timezone:'Europe/Madrid',attentionSnapshot:attentionDashboardDTO({contract:2,hotelId:b,origin:'traced',urgentOnly:false,messages:[],counters:{received:0,resolved:0,pending:0,urgent:0}},b)}),pmsSnapshot:{available:false}}});
  });
}
for(const width of [1366,390])test(`original Platform entry ${width}: authorized selection, reload, Inbox and return`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await prepare(page);
  await page.goto('/platform/hotels');
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:hotel(a).name,exact:true})});
  await card.getByRole('button',{name:'Entrar al workspace',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/dashboard\\?hotelId='+a+'$'));
  await expect(page.getByRole('heading',{name:hotel(a).name,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('staynex_support_session')).hotelId)).toBe(a);
  await page.reload();await expect(page.getByRole('heading',{name:hotel(a).name,exact:true})).toBeVisible();
  if(width===390)await page.getByRole('button',{name:/Abrir menú de navegación|Abrir navegación/}).click();
  await page.getByRole('link',{name:/^Inbox ·/}).click();await expect(page).toHaveURL(/\/dashboard\/inbox/);
  await expect(page.getByRole('textbox',{name:'Buscar huésped, habitación, mensaje o idioma'})).toBeVisible();
  if(width===390)await page.getByRole('button',{name:/Abrir menú de navegación|Abrir navegación/}).click();
  await page.getByRole('link',{name:'Volver a Platform',exact:true}).first().click();
  await expect(page).toHaveURL(/\/platform\/hotels/);
  await page.locator('article').filter({has:page.getByRole('heading',{name:hotel(b).name,exact:true})}).getByRole('button',{name:'Entrar al workspace',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/dashboard\\?hotelId='+b+'$'));
  await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Hotel B sintético',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:hotel(a).name,exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))).toEqual({width,scroll:width});
  await page.screenshot({path:info.outputPath('workspace-'+width+'.png'),fullPage:true});
});
test('pending onboarding follows the existing authorized destination after the original button',async({page})=>{
 await prepare(page,{pending:true});await page.goto('/platform/hotels');
 await page.locator('article').filter({has:page.getByRole('heading',{name:hotel(a).name,exact:true})}).getByRole('button',{name:'Entrar al workspace',exact:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/onboarding$/);await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('staynex_active_workspace_id'))).toBe(a);
});

test('original entry exposes pending and recoverable failure; newest hotel wins',async({page})=>{
 await prepare(page);await page.goto('/platform/hotels');
 let release;const hold=new Promise(r=>release=r);
 await page.route('**/api/platform/hotels/*/support',async route=>{
  const id=new URL(route.request().url()).pathname.split('/').at(-2);
  if(id===a){await hold;return route.fulfill({status:503,json:{error:'Synthetic failure'}})}
  return route.fulfill({json:{ok:true,hotel:hotel(b),supportSession:{hotelId:b,hotelName:hotel(b).name,readonly:true}}});
 });
 const card=id=>page.locator('article').filter({has:page.getByRole('heading',{name:hotel(id).name,exact:true})});
 await card(a).getByRole('button',{name:'Entrar al workspace',exact:true}).click();
 await expect(card(a).getByRole('button',{name:'Entrando al workspace…'})).toBeDisabled();
 release();await expect(page.getByRole('alert').filter({hasText:'No se pudo entrar al hotel. Vuelve a intentarlo.'})).toBeVisible();
 await expect(card(a).getByRole('button',{name:'Entrar al workspace',exact:true})).toBeEnabled();
 await card(b).getByRole('button',{name:'Entrar al workspace',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('hotelId='+b+'$'));await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('staynex_active_workspace_id'))).toBe(b);
});
