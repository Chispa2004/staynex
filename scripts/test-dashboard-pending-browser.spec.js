import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const before=process.env.PENDING_BEFORE==='1';
const h='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
test.beforeEach(async({context,page})=>{
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('**/api/executive-dashboard?*',async route=>{
    const response=await route.fetch(),body=await response.json();
    body.conversationDashboard.messageWorkspace.messages=Array.from({length:5},(_,n)=>({id:'synthetic-'+n,guest:'Huésped de prueba '+(n+1),room:String(201+n),title:['Solicita dos toallas para la habitación','El aire acondicionado pierde agua','Consulta sobre la salida del hotel','Petición de limpieza','Confirmación del horario de desayuno'][n],priority:n===1?'urgent':'normal',status:'Pendiente',createdAt:'2026-10-05T08:00:00Z',stayStage:'Durante la estancia',origin:'simulated',href:'/dashboard/inbox',actionLabel:'Abrir conversación'}));
    await route.fulfill({response,json:body});
  });
});
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'ignoreErrors'});});
for(const width of [1920,1366,390]) for(const theme of ['light','dark']) test(`${width} ${theme}: layout, keyboard, destinations and source separation`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:1080});
  await page.addInitScript(t=>localStorage.setItem('staynex_dashboard_theme',t),theme);
  await page.goto('/dashboard?attentionOrigin=simulated');
  const messages=page.getByRole('region',{name:'Mensajes',exact:true});
  const services=page.getByRole('region',{name:'Estado de conexión y servicios',exact:true});
  await expect(messages.getByText('Huésped de prueba 1',{exact:true})).toBeVisible();
  await expect(services.getByText('PMS',{exact:true})).toBeVisible();
  const actual=await page.evaluate(()=>({width:innerWidth,height:innerHeight,theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth-innerWidth}));
  expect(actual.width).toBe(width);expect(actual.theme).toBe(theme);expect(actual.overflow).toBeLessThanOrEqual(1);
  if(!before) {
    const panel=page.getByRole('region',{name:'Tickets pendientes',exact:true});
    const rows=panel.locator('li a');await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('Fuga de agua');
    await expect(panel).toContainText('503 pendientes');
    await expect(panel).not.toContainText('Solicitud completada');await expect(panel).not.toContainText('Toallas SIMULADAS');
    await expect(rows.first()).toContainText('Nuevo');
    const [m,t,s]=await Promise.all([messages.boundingBox(),panel.boundingBox(),services.boundingBox()]);
    expect(s.y).toBeGreaterThanOrEqual(Math.max(m.y+m.height,t.y+t.height));
    if(width>1000){expect(Math.abs(m.y-t.y)).toBeLessThan(2);expect(t.x).toBeGreaterThan(m.x);expect(s.width).toBeGreaterThan(t.width*1.7);}
    else {expect(t.y).toBeGreaterThan(m.y);expect(s.y).toBeGreaterThan(t.y);}
    await page.screenshot({path:info.outputPath('after.png'),fullPage:true});
    await services.scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('after-services.png'),fullPage:true});
    if(width===390){await panel.locator('h2').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('after-tickets.png'),fullPage:true});}
    await rows.first().focus();await rows.first().press('Enter');
    await expect(page.getByRole('heading',{name:'Fuga de agua · revisión urgente',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Volver al Dashboard',exact:true}).click();
    await expect(page).toHaveURL(/attentionOrigin=simulated/);
    await expect(panel.locator('li a')).toHaveCount(5);
    await panel.getByRole('link',{name:'Ver todos los pendientes',exact:true}).click();
    await expect(page).toHaveURL(/metric=pending/);await expect(page).toHaveURL(/ticketOrigin=other/);
    await expect(page.getByText('503 tickets',{exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Volver al Dashboard',exact:true}).click();
    await panel.getByRole('combobox',{name:'Origen de los tickets',exact:true}).selectOption('simulated');
    await expect(panel.locator('li a')).toHaveCount(1);await expect(panel).toContainText('Toallas SIMULADAS');
    await expect(page.getByRole('combobox',{name:'Origen de los indicadores:',exact:true})).toHaveValue('simulated');
    for(const metric of ['recibidos','resueltos','pendientes','urgentes'])await expect(page.getByRole('link',{name:new RegExp('^Mensajes '+metric)})).toHaveAttribute('href',/metricOrigin=simulated/);
  } else {await page.screenshot({path:info.outputPath('before.png'),fullPage:true});await services.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('before-services.png'),fullPage:true});}
  writeFileSync(info.outputPath('dimensions.json'),JSON.stringify(actual,null,2));
});
test('independent slow load, preserved refresh, empty, error/retry and denied or foreign payload',async({page})=>{
  test.skip(before);let mode='slow',release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/tickets?view=pending*',async route=>{
    if(mode==='slow')await gate;
    if(mode==='error'||mode==='denied')return route.fulfill({status:mode==='error'?503:403,json:{error:'Synthetic failure'}});
    const response=await route.fetch(),body=await response.json();
    if(mode==='empty'){body.tickets=[];body.total=0;}if(mode==='foreign')body.hotelId=b;
    await route.fulfill({response,json:body});
  });
  await page.addInitScript(id=>localStorage.setItem('staynex_active_workspace_id',id),h);
  await page.goto('/dashboard');
  const panel=page.getByRole('region',{name:'Tickets pendientes',exact:true});
  await expect(page.getByRole('region',{name:'Mensajes',exact:true})).toContainText('Huésped de prueba 1');
  await expect(panel).toContainText('Cargando tickets');mode='ok';release();
  await expect(panel.locator('li a')).toHaveCount(5);
  mode='error';await panel.getByRole('button',{name:'Actualizar tickets'}).click();
  await expect(panel.getByRole('alert')).toContainText('datos anteriores');await expect(panel.locator('li a')).toHaveCount(5);
  mode='ok';await panel.getByRole('button',{name:'Reintentar tickets'}).click();await expect(panel.getByRole('alert')).toHaveCount(0);
  mode='empty';await panel.getByRole('button',{name:'Actualizar tickets'}).click();await expect(panel).toContainText('No hay tickets pendientes');
  mode='denied';await panel.getByRole('button',{name:'Actualizar tickets'}).click();await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.locator('li a')).toHaveCount(0);await expect(panel).not.toContainText('No hay tickets pendientes');
  mode='ok';await panel.getByRole('button',{name:'Reintentar tickets'}).click();await expect(panel.locator('li a')).toHaveCount(5);
  mode='foreign';await panel.getByRole('button',{name:'Actualizar tickets'}).click();await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.locator('li a')).toHaveCount(0);
});
test('hotel change discards a late response from the previous authorized context',async({page})=>{
  test.skip(before);let current=h,hold=false,release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/onboarding/state',async route=>{const response=await route.fetch(),body=await response.json();body.state={...body.state,hotel_id:current,onboarding_completed:true};await route.fulfill({response,json:body});});
  await page.route('**/api/current-hotel',async route=>{const response=await route.fetch(),body=await response.json();body.hotel={...body.hotel,id:current};body.hotelUser={...body.hotelUser,hotel_id:current};await route.fulfill({response,json:body});});
  await page.route('**/api/tickets?view=pending*',async route=>{
    const requested=route.request().headers()['x-staynex-hotel-id']||h;
    if(requested===h && hold)await gate;
    await route.fulfill({json:{hotelId:requested,origin:'other',timezone:'Europe/Madrid',readAt:new Date().toISOString(),total:1,tickets:[{id:requested,title:requested===h?'Petición hotel A':'Petición hotel B',room_number:requested===h?'A-101':'B-909',priority:'normal',effectivePriority:'normal',status:'open',created_at:'2026-10-05T08:00:00Z'}]}});
  });
  await page.addInitScript(id=>localStorage.setItem('staynex_active_workspace_id',id),h);await page.goto('/dashboard');
  const panel=page.getByRole('region',{name:'Tickets pendientes',exact:true});
  await expect(panel).toContainText('Petición hotel A');hold=true;
  await panel.getByRole('button',{name:'Actualizar tickets'}).click();current=b;
  await page.evaluate(id=>{localStorage.setItem('staynex_active_workspace_id',id);window.dispatchEvent(new CustomEvent('staynex:workspace-selection-changed',{detail:{hotelId:id}}));},b);
  await expect(panel).toContainText('Petición hotel B');release();
  await expect(panel).not.toContainText('Petición hotel A');await expect(panel).not.toContainText('A-101');
});
