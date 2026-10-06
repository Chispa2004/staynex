import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const hotelId='1ef60a40-b65f-4bff-9bd3-22654e5029f2';
const waitForData=async page=>{await expect(page.getByRole('heading',{name:'Hotel QA demo · datos sintéticos',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Mensajes',exact:true}).getByRole('link',{name:/Abrir conversación/})).toHaveCount(5);};
test.beforeEach(async({page})=>{await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());});
for(const width of [1920,1366,390])for(const theme of ['light','dark'])test(`demo ${width} ${theme}: loading, panels and keyboard`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:1080});
  await page.addInitScript(t=>localStorage.setItem('staynex_dashboard_theme',t),theme);
  const seen=[];page.on('request',r=>seen.push(new URL(r.url()).pathname));
  let release;const gate=new Promise(r=>release=r);
  await page.route('**/api/current-hotel',async route=>{await gate;await route.continue();});
  await page.goto('/dashboard');await expect(page.locator('[data-workspace-loading]')).toBeVisible();
  await expect(page.getByText('Completar onboarding',{exact:true})).toHaveCount(0);
  release();await waitForData(page);
  await expect(page.locator('section[data-theme]')).toHaveAttribute('data-theme',theme);
  expect(seen.filter(p=>p==='/api/onboarding/state')).toHaveLength(0);
  await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
  await expect(page.getByText('Cargando hotel',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:/Origen/})).toHaveCount(0);
  await expect(page.getByText('Modo demo',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Tickets pendientes',exact:true}).getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('heading',{name:'Estado de conexión y servicios',exact:true})).toHaveCount(1);
  const region=page.getByRole('region',{name:'Mensajes',exact:true});
  await region.getByRole('tab',{name:'Últimos',exact:true}).press('ArrowRight');
  await expect(region.getByRole('tab',{name:'Urgentes',exact:true})).toBeFocused();
  await expect(region.getByRole('tab',{name:'Urgentes',exact:true})).toHaveAttribute('aria-selected','true');
  await region.getByRole('tab',{name:'Urgentes',exact:true}).press('Home');await waitForData(page);
  let finish;const pending=new Promise(r=>finish=r);
  await page.route('**/api/executive-dashboard?*',async route=>{await pending;await route.continue();});
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
  await expect(region.getByRole('link',{name:/Abrir conversación/})).toHaveCount(5);
  finish();await page.unroute('**/api/executive-dashboard?*');
  const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth}));expect(dimensions.width).toBe(width);expect(dimensions.overflow).toBe(0);
  await page.screenshot({path:info.outputPath('dashboard.png'),fullPage:true});await fs.writeFile(info.outputPath('dimensions.json'),JSON.stringify({...dimensions,theme}));
});
test('four cards retain history and source scope in Inbox; message deep link locates exact message',async({page})=>{
  await page.goto('/dashboard');await waitForData(page);
  for(const label of ['Mensajes recibidos','Mensajes resueltos','Mensajes pendientes','Mensajes urgentes']) {
    const card=page.getByRole('link',{name:new RegExp('^'+label+' ')});const href=await card.getAttribute('href');
    expect(href).toContain('metricOrigin=all');expect(href).toContain('metricPeriod=history');expect(href).toContain(hotelId);
    const value=Number((await card.innerText()).match(/\n(\d+)\n/)[1]);
    await card.click();const summary=page.getByRole('region',{name:'Filtro del Dashboard',exact:true});
    await expect(summary.getByRole('status')).toContainText(value+' mensajes');
    await page.goto('/dashboard');await waitForData(page);
  }
  const link=page.getByRole('region',{name:'Mensajes',exact:true}).getByRole('link',{name:/Abrir conversación/}).first();const href=await link.getAttribute('href');const messageId=new URL(href,'http://localhost').searchParams.get('messageId');
  await link.click();await expect(page.locator('[data-dashboard-message="'+messageId+'"]')).toBeInViewport();await expect(page.getByText('Mensaje abierto desde el Dashboard',{exact:true})).toBeVisible();
});
test('secondary failure retries locally, onboarding pending redirects and authorization stays closed',async({page})=>{
  await page.route('**/api/executive-dashboard?*',route=>route.fulfill({status:503,json:{error:'Fallo sintético'}}));
  await page.goto('/dashboard');await expect(page.getByRole('alert').filter({hasText:"Fallo sintético"})).toBeVisible();
  await expect(page.getByRole('button',{name:'Actualizar',exact:true})).toBeEnabled();await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
  await page.unroute('**/api/executive-dashboard?*');await page.getByRole('button',{name:'Actualizar',exact:true}).click();await waitForData(page);
  await page.route('**/api/current-hotel',async route=>{const response=await route.fetch();const b=await response.json();b.onboardingGate.completed=false;await route.fulfill({response,json:b});});
  await page.reload();await expect(page).toHaveURL(/\/dashboard\/onboarding$/);
  await page.unroute('**/api/current-hotel');await page.route('**/api/current-hotel',route=>route.fulfill({status:403,json:{accessDenied:true,accessDeniedReason:'hotel_not_authorized'}}));
  await page.goto('/dashboard');await expect(page.getByRole('region',{name:'Mensajes',exact:true})).toHaveCount(0);
});

test('incomplete refresh keeps confirmed messages, exposes error and recovers',async({page})=>{
  await page.goto('/dashboard');await waitForData(page);
  const messages=page.getByRole('region',{name:'Mensajes',exact:true});
  const previous=await messages.getByRole('link',{name:/Abrir conversación/}).allTextContents();
  await page.route('**/api/executive-dashboard?*',async route=>{
    const response=await route.fetch();const body=await response.json();
    body.conversationDashboard.messageWorkspace.coverage='unavailable';
    body.conversationDashboard.messageWorkspace.messages=[];
    await route.fulfill({response,json:body});
  });
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'últimos datos confirmados'})).toBeVisible();
  expect(await messages.getByRole('link',{name:/Abrir conversación/}).allTextContents()).toEqual(previous);
  await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
  await page.unroute('**/api/executive-dashboard?*');
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'últimos datos confirmados'})).toHaveCount(0);await waitForData(page);
});
