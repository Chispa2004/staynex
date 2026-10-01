import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const routes=['tickets','reservations','health','automations','settings/users','knowledge','settings/pms','onboarding','housekeeping','maintenance','settings/academy'].map(p=>'/dashboard/'+p).concat(['/settings','/platform/hotels','/dashboard/reception','/dashboard/experience-bookings','/dashboard/qr-rooms','/dashboard/local-knowledge','/dashboard/upsells','/dashboard/experiences','/dashboard/analytics','/dashboard/ai-logs','/dashboard/simulation','/platform','/platform/providers','/platform/monitoring']);
const sizes=[[1366,768],[1280,720],[1920,1080],[390,844]];
const measure=()=>{
  const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
  const title=document.querySelector('main h1');
  const body=document.querySelector('[data-density-body]')||document.querySelector('main')?.firstElementChild?.lastElementChild;
  const root=document.querySelector('[data-density-page]')||[...body?.children||[]].find(e=>e.contains(title));
  const children=root?[...root.children].filter(e=>e.getBoundingClientRect().height>0):[];
  const empty=[...document.querySelectorAll('main p')].find(e=>e.textContent==='No hay reservas con estos filtros.');
  return {viewport:[innerWidth,innerHeight],scale:visualViewport.scale,scroll:document.querySelector('main')?.scrollTop,
    title:box(title),firstSection:box(children[1]),row1:box(document.querySelector('tbody tr')),row2:box(document.querySelector('tbody tr:nth-child(2)')),empty:box(empty),
    overflow:document.body.scrollWidth>innerWidth+1 || document.querySelector("main").scrollWidth>document.querySelector("main").clientWidth+1,
    layout:[...document.querySelectorAll('main h1,main h2,main input,main textarea,main button,main a,aside')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({name:(e.getAttribute('aria-label')||e.textContent).trim(),box:box(e)}))};
};
test.beforeEach(async({context,page})=>{
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
});
for(const theme of ['light','dark'])for(const [width,height] of sizes){
  test(`production density ${theme} ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(t=>localStorage.setItem('staynex_dashboard_theme',t),theme);
    const records=[];
    const dir=process.env.DENSITY_EVIDENCE||path.dirname(info.outputPath('evidence'));
    await fs.mkdir(dir,{recursive:true});
    const capture=async(name)=>{
      await page.evaluate(()=>document.fonts.ready);
      if(name.startsWith('excluded')) {
        await page.waitForLoadState('networkidle',{timeout:10000});
        await page.waitForTimeout(350); // Existing drawer transition and unread debounce finish before measuring.
      }
      await page.evaluate(()=>document.querySelector('main')?.scrollTo(0,0));
      const record={name,...await page.evaluate(measure)};records.push(record);
      await page.screenshot({path:path.join(dir,`${theme}-${width}-${name}.png`)});
      return record;
    };
    for(const url of process.env.DENSITY_EXCLUSIONS_ONLY ? [] : routes){
      console.log("Density capture",theme,width,url);
      await page.goto(url);
      await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
      await expect(page.locator('main h1')).not.toHaveText(/Preparando/);
      await expect(page.getByRole('status').filter({hasText:/Consultando|Preparando|Comprobando/})).toHaveCount(0);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const row=await capture(url.replaceAll('/','-'));
      if(process.env.DENSITY_BASELINE!=='1'){
        expect.soft(row.overflow,url+' page width').toBe(false);
        if(url==='/dashboard/tickets'&&width>=1280){
          expect.soft(row.row1?.y).toBeLessThan(height);
          expect.soft(row.row2?.y).toBeLessThan(height);
        }
      }
    }
    // The empty result uses the same real Reservations handler and a date after
    // all fixture stays. No records or filters are changed between builds.
    if(!process.env.DENSITY_EXCLUSIONS_ONLY) {
    await page.goto('/dashboard/reservations?metric=upcoming&date=2027-01-01');
    await expect(page.getByText('No hay reservas con estos filtros.',{exact:true})).toBeVisible();
    const empty=await capture('reservations-empty');
    if(process.env.DENSITY_BASELINE!=='1'&&width>=1280)expect.soft(empty.empty?.bottom).toBeLessThan(height);
    }
    for(const url of ['/dashboard','/dashboard/inbox','/dashboard/inbox?metric=pending&metricOrigin=simulated&hotelId=00000000-0000-4000-8000-000000000001']){
      await page.goto(url);await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      if(url==='/dashboard')await expect(page.getByRole('link',{name:/Mensajes recibidos/})).toBeVisible();
      else await expect(page.getByRole('button',{name:/Huésped sintético/}).first()).toBeVisible();
      await capture('excluded'+url.replaceAll('/','-').replaceAll('?','-').replaceAll('&','-').replaceAll('=','-'));
    }
    await page.goto('/dashboard/inbox');
    await page.getByRole('button',{name:/^HS Huésped sintético 1 Habitación 200/}).click();
    await capture('excluded-inbox-conversation');
    await page.getByRole('button',{name:/^Asistencia IA/}).click();await expect(page.getByRole('dialog',{name:'Asistencia IA',exact:true})).toBeVisible();
    await capture('excluded-inbox-assistance');await page.keyboard.press('Escape');
    if(width===390){await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();await capture('excluded-menu')}
    if(process.env.DENSITY_COMPARE){
      const previous=JSON.parse(await fs.readFile(path.join(process.env.DENSITY_COMPARE,`${theme}-${width}.json`),'utf8'));
      for(const record of records.filter(r=>r.name.startsWith('excluded')))expect.soft(record.layout,record.name).toEqual(previous.find(p=>p.name===record.name).layout);
    }
    const previousRecords=process.env.DENSITY_EXCLUSIONS_ONLY ? JSON.parse(await fs.readFile(path.join(dir,`${theme}-${width}.json`),'utf8')).filter(r=>!r.name.startsWith('excluded')) : [];
    await fs.writeFile(path.join(dir,`${theme}-${width}.json`),JSON.stringify([...previousRecords,...records],null,2));
  });
}

test('compact filters retain counts, keyboard disclosure, pagination, search and visible failures',async({page})=>{
  test.skip(process.env.DENSITY_BASELINE==='1','The baseline records the previous UI.');
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/dashboard/tickets');
  const region=page.getByRole('region',{name:'Filtro operativo',exact:true});
  await expect(region.getByRole('status')).toHaveText('67 tickets');
  const help=page.locator('summary').filter({hasText:'Acerca de estos resultados'});
  await help.press('Enter');await expect(page.getByText('El resultado se actualiza al consultar; puede cambiar respecto a la tarjeta.',{exact:true})).toBeVisible();
  await help.press('Enter');await expect(page.getByText('El resultado se actualiza al consultar; puede cambiar respecto a la tarjeta.',{exact:true})).not.toBeVisible();
  await page.getByRole('link',{name:/Riesgo urgente/}).click();
  await expect(region).toContainText('Filtro operativo: Riesgo urgente');
  await expect(region.getByRole('status')).toHaveText('17 tickets');
  await region.getByRole('link',{name:'Retirar filtros',exact:true}).click();
  await expect(region.getByRole('status')).toHaveText('67 tickets');
  await page.getByRole('link',{name:'Siguiente',exact:true}).first().click();
  await expect(page).toHaveURL(/page=2/);await expect(page.getByRole('navigation',{name:'Páginas de resultados'}).first()).toContainText('Página 2');
  await page.getByRole('combobox',{name:'Prioridad',exact:true}).selectOption('urgent');
  await expect(page).toHaveURL(/priority=urgent/);await expect(region.getByRole('status')).toHaveText('17 tickets');
  await page.goto('/dashboard/reservations?metric=total');
  await expect(page.getByRole('region',{name:'Filtro operativo'}).getByRole('status')).toHaveText('137 reservas');
  await page.getByRole('textbox',{name:/Buscar por nombre/}).fill('QA 137');
  await expect(page.getByRole('region',{name:'Filtro operativo'}).getByRole('status')).toHaveText('1 reservas');
  await expect(page.getByRole('region',{name:'Filtro operativo'})).toContainText('Búsqueda: QA 137');
  await page.route('**/api/tickets?*',route=>route.fulfill({status:503,json:{error:'Consulta sintética interrumpida; reintenta.'}}));
  await page.goto('/dashboard/tickets');
  await expect(page.getByRole('alert').filter({hasText:'Consulta sintética interrumpida'})).toBeVisible();
  await expect(page.getByText('Resultados no confirmados',{exact:true})).toBeVisible();
  await expect(page.locator('tbody')).toHaveCount(0);
  await page.unroute('**/api/tickets?*');
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.getByRole('region',{name:'Filtro operativo'}).getByRole('status')).toHaveText('67 tickets');
});

test('all eleven metric cards still navigate to their scoped results',async({page})=>{
  test.skip(process.env.DENSITY_BASELINE==='1','Behavior is covered on the final build.');
  const groups=[
    ['/dashboard?attentionOrigin=simulated',['received','resolved','pending','urgent'],'/api/inbox'],
    ['/dashboard/tickets',['urgent_risk','satisfaction_risk','ai_prioritized'],'/api/tickets'],
    ['/dashboard/reservations',['total','arrivingSoon','stayingNow','completed'],'/api/reservations']
  ];
  for(const [url,metrics,endpoint] of groups)for(const metric of metrics){
    await page.goto(url);
    const card=page.locator('main a[href*="metric='+metric+'"]').first();
    await expect(card).toBeVisible();
    const href=await card.getAttribute('href');
    expect(new URL(href,'http://127.0.0.1').searchParams.get('hotelId')).toBe('00000000-0000-4000-8000-000000000001');
    const count=Number((await card.innerText()).match(/\d+/)[0]);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&new URL(r.url()).searchParams.get('metric')===metric&&r.ok());
    await card.click();const result=await (await response).json();
    expect(endpoint==='/api/inbox'?result.metric.messageCount:result.metrics.total).toBe(count);
    await expect(page).toHaveURL(new RegExp('metric='+metric));
    await expect(page.getByRole(endpoint==='/api/inbox'?'button':'link',{name:/Retirar filtro/}).first()).toBeVisible();
  }
});
