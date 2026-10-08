import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

test.beforeEach(async({context})=>{
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
});
const rowFor=(page,width)=>width===390?page.locator('main article').first():page.locator('tbody tr').first();
const ready=async page=>{await page.goto('/dashboard/tickets');await expect(page.getByRole('region',{name:'Filtro operativo',exact:true})).toContainText('67 tickets');};
for(const width of [1920,1366,390])for(const theme of ['light','dark'])test(`ticket actions ${width} ${theme}: names, colors, layout and keyboard`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:1080});
  await page.addInitScript(t=>localStorage.setItem('staynex_dashboard_theme',t),theme);
  await ready(page);
  const row=rowFor(page,width);
  await expect(page.getByRole('columnheader',{name:'Asistencia IA',exact:true})).toHaveCount(0);
  await expect(page.locator('article,tbody').getByText('Asistencia IA',{exact:true})).toHaveCount(0);
  for(const name of ['Riesgo urgente','Satisfacción en riesgo','Priorizados por IA'])await expect(page.getByRole('link',{name:new RegExp(name)})).toBeVisible();
  await expect(row.getByRole('button',{name:'Abierto · Estado actual',exact:true})).toBeDisabled();
  await expect(row.getByRole('button',{name:'En curso',exact:true})).toBeEnabled();
  await expect(row.getByRole('button',{name:'Hecho',exact:true})).toBeEnabled();
  await expect(row.getByRole('group')).toContainText('Estado actual');
  const colors=await row.locator('button[data-ticket-status]').evaluateAll(es=>es.map(e=>({status:e.dataset.ticketStatus,color:getComputedStyle(e).color,border:getComputedStyle(e).borderColor,bg:getComputedStyle(e).backgroundColor})));
  expect(new Set(colors.map(c=>c.color)).size).toBe(3);
  const expected=theme==='light'?['rgb(133, 77, 14)','rgb(30, 64, 175)','rgb(22, 101, 52)']:['rgb(253, 230, 138)','rgb(191, 219, 254)','rgb(167, 243, 208)'];
  expect(colors.map(c=>c.color)).toEqual(expected);
  await row.getByRole('button',{name:'En curso',exact:true}).focus();
  expect(await row.getByRole('button',{name:'En curso',exact:true}).evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
  const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,mainOverflow:document.querySelector('main').scrollWidth-document.querySelector('main').clientWidth,table:[...document.querySelectorAll('table')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({width:e.clientWidth,scroll:e.scrollWidth}))}));
  expect(dimensions.width).toBe(width);expect(dimensions.overflow).toBeLessThanOrEqual(1);expect(dimensions.mainOverflow).toBeLessThanOrEqual(1);
  for(const t of dimensions.table)expect(t.scroll-t.width).toBeLessThanOrEqual(1);
  await page.screenshot({path:info.outputPath('tickets.png'),fullPage:true});
  await fs.writeFile(info.outputPath('dimensions.json'),JSON.stringify({theme,...dimensions,colors},null,2));
  await row.getByRole('link').focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Asistencia IA para este ticket',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Abierto · Estado actual',exact:true})).toBeDisabled();
});

test('ticket save: three transitions, pending lock, confirmed state, visible failure, recovery and no row navigation',async({page})=>{
  await page.setViewportSize({width:1366,height:1080});
  const states=new Map();let tickets=[];
  await page.route('**/api/tickets?*',async r=>{const response=await r.fetch(),body=await response.json();body.tickets=body.tickets.map(t=>({...t,status_version:1,...states.get(t.id)}));tickets=body.tickets;await r.fulfill({response,json:body});});
  await ready(page);const row=page.locator('tbody tr').first();let calls=0,hold;
  await page.route('**/api/tickets/*/status',r=>{calls++;hold=r;});
  await row.getByRole('button',{name:'En curso',exact:true}).press('Enter');
  await expect(row.getByRole('status')).toHaveText('Guardando estado…');
  await expect(row.getByRole('button',{name:'Hecho',exact:true})).toBeDisabled();
  await expect(row.locator('span[data-ticket-status]')).toHaveText('Abierto');
  await row.getByRole('button',{name:'En curso',exact:true}).press('Enter');expect(calls).toBe(1);
  await hold.fulfill({status:503,json:{error:'synthetic failure'}});
  await expect(row.getByRole('alert')).toContainText('último estado confirmado');
  await expect(row.locator('span[data-ticket-status]')).toHaveText('Abierto');
  for(const [value,label] of [['in_progress','En curso'],['completed','Hecho'],['open','Abierto']]){
    await row.getByRole('button',{name:label,exact:true}).press('Enter');await expect(row.getByRole('status')).toBeVisible();
    const previous=states.get(tickets[0].id)||tickets[0],ticket={...previous,status:value,status_version:previous.status_version+1};
    expect(hold.request().postDataJSON()).toEqual({status:value,expectedStatus:previous.status,expectedVersion:previous.status_version,hotelId:previous.hotel_id,operationId:expect.stringMatching(/^[0-9a-f-]{36}$/i)});
    states.set(ticket.id,ticket);await hold.fulfill({json:{ticket}});
    await expect(row.getByRole('button',{name:label+' · Estado actual',exact:true})).toBeDisabled();
    await expect(row.locator('span[data-ticket-status]')).toHaveText(label);
    await expect(page).toHaveURL(/\/dashboard\/tickets$/);
  }
  await row.getByRole('button',{name:'Hecho',exact:true}).press('Enter');await expect(row.getByRole('status')).toBeVisible();
  await hold.fulfill({status:403,json:{error:'Access denied'}});await expect(row.getByRole('alert')).toContainText('No tienes permiso');
  await expect(row.locator('span[data-ticket-status]')).toHaveText('Abierto');
  await row.getByRole('button',{name:'Hecho',exact:true}).press('Enter');await expect(row.getByRole('status')).toBeVisible();
  await hold.fulfill({json:{ticket:{...tickets[0],hotel_id:'00000000-0000-4000-8000-000000000002',status:'completed',status_version:tickets[0].status_version+1}}});
  await expect(row.getByRole('alert')).toContainText('No se pudo confirmar');await expect(row.locator('span[data-ticket-status]')).toHaveText('Abierto');
});

test('mobile failure retains state; distinct pending/closed/cancelled labels and scoped refresh',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/tickets?*',async r=>{const response=await r.fetch(),body=await response.json();body.tickets=body.tickets.slice(0,3).map((t,i)=>({...t,status:['pending','closed','cancelled'][i]}));await r.fulfill({response,json:body});});
  await ready(page);const cards=page.locator('main article');
  for(const [i,label] of ['Pendiente','Cerrado','Cancelado'].entries())await expect(cards.nth(i).locator('span[data-ticket-status]')).toHaveText(label);
  await page.route('**/api/tickets/*/status',r=>r.fulfill({status:403,json:{error:'Access denied'}}));
  await cards.first().getByRole('button',{name:'Hecho',exact:true}).click();
  await expect(cards.first().getByRole('alert')).toContainText('No tienes permiso');
  await expect(cards.first().locator('span[data-ticket-status]')).toHaveText('Pendiente');await expect(page).toHaveURL(/\/dashboard\/tickets$/);
});

test('independent rows keep their save locks when another request finishes',async({page})=>{
  await page.setViewportSize({width:1366,height:1080});
  let tickets=[];const states=new Map(),held=[];
  await page.route('**/api/tickets?*',async r=>{const response=await r.fetch(),body=await response.json();body.tickets=body.tickets.map(t=>({...t,status_version:1,...states.get(t.id)}));tickets=body.tickets;await r.fulfill({response,json:body});});
  await page.route('**/api/tickets/*/status',r=>{held.push(r);});
  await ready(page);const first=page.locator('tbody tr').nth(0),second=page.locator('tbody tr').nth(1);
  await first.getByRole('button',{name:'En curso',exact:true}).click();await expect(first.getByRole('status')).toBeVisible();
  await second.getByRole('button',{name:'Hecho',exact:true}).click();await expect(second.getByRole('status')).toBeVisible();
  const updated={...tickets[1],status:'completed',status_version:tickets[1].status_version+1};states.set(updated.id,updated);await held[1].fulfill({json:{ticket:updated}});
  await expect(second.getByRole('button',{name:'Hecho · Estado actual',exact:true})).toBeDisabled();
  await expect(first.getByRole('button',{name:'Hecho',exact:true})).toBeDisabled();
  await expect(first.getByRole('status')).toHaveText('Guardando estado…');expect(held).toHaveLength(2);
  await held[0].fulfill({status:503,json:{error:'synthetic failure'}});
  await expect(first.getByRole('alert')).toBeVisible();await expect(first.getByRole('button',{name:'En curso',exact:true})).toBeEnabled();
});
