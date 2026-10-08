import {test,expect} from '@playwright/test';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
for(const width of [1366,390])for(const theme of ['light','dark'])test(`attention lifecycle ${width} ${theme}: server confirmation, receipt group, errors and keyboard`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.addInitScript(theme=>localStorage.setItem('staynex_dashboard_theme',theme),theme);
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 let state='open',version=1,fail=true,operations=[],attention=new Map([40,41,42].map(n=>[id(n),{messageId:id(n),status:'pending',version:1,changedAt:'2026-10-08T10:00:00Z'}]));
 await page.route('**/api/tickets/*/status',async r=>{
  const body=r.request().postDataJSON();operations.push(body);await new Promise(resolve=>setTimeout(resolve,300));
  if(fail)return r.fulfill({status:503,json:{error:'Fallo sintético'}});
  if(body.expectedVersion!==version)return r.fulfill({status:409,json:{error:'Conflict'}});
  state=body.status;version++;return r.fulfill({json:{ticket:{id:id(60),hotel_id:id(1),status:state,status_version:version}}});
 });
 await page.route('**/api/inbox/attention',async r=>{
  const b=r.request().postDataJSON();
  if(b.action!=='read'){
   expect(b.items.map(x=>x.messageId).sort()).toEqual([id(40),id(41)]);expect(state).toBe('completed');
   for(const x of b.items)attention.set(x.messageId,{messageId:x.messageId,status:b.action,version:x.expectedVersion+1,changedAt:new Date().toISOString()});
  }
  const ids=b.action==='read'?b.messageIds:b.items.map(x=>x.messageId);
  await r.fulfill({json:{contract:1,hotelId:id(1),conversationId:id(21),canManage:true,items:ids.map(i=>attention.get(i)),ticketGroups:[{ticketId:id(60),title:'Dos toallas sintéticas',status:state,version,messageIds:[id(40),id(41)]}]}});
 });
 await page.goto('/lifecycle-probe');await expect(page.getByRole('heading',{name:'Ciclo de atención · laboratorio'})).toBeVisible();
 const progress=page.getByRole('button',{name:'En curso',exact:true}).filter({visible:true});
 await progress.press('Enter');await expect(progress).toBeDisabled();await expect(page.getByRole('alert').filter({hasText:'No se pudo confirmar'})).toBeVisible();expect(state).toBe('open');
 fail=false;await progress.click();await expect(page.getByRole('button',{name:'En curso · Estado actual',exact:true}).filter({visible:true})).toBeVisible();
 expect(operations[0].operationId).toBe(operations[1].operationId);
 const first=page.locator('[data-message-attention="'+id(40)+'"]');
 await first.getByLabel('Opciones de atención de este mensaje').click();await first.getByRole('button',{name:'Marcar como resuelto',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Primero completa'})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Hecho',exact:true}).filter({visible:true}).click();await expect(page.getByRole('button',{name:'Hecho · Estado actual',exact:true}).filter({visible:true})).toBeVisible();
 await page.getByRole('button',{name:'Recargar seguimiento'}).click();await first.getByLabel('Opciones de atención de este mensaje').click();await first.getByRole('button',{name:'Marcar como resuelto',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Marcar como resueltos (2)');await expect(page.getByRole('dialog')).toContainText('Las dos son de baño.');
 await page.getByRole('button',{name:'Confirmar',exact:true}).press('Enter');await expect(first).toContainText('Resuelto');await expect(page.locator('[data-message-attention="'+id(42)+'"]')).toContainText('Pendiente');
 await page.getByRole('button',{name:'Recargar seguimiento'}).click();await expect(first).toContainText('Resuelto');
 const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(dimensions.width).toBe(width);expect(dimensions.scroll).toBeLessThanOrEqual(width);
 await page.screenshot({path:info.outputPath(`lifecycle-${width}-${theme}.png`),fullPage:true});
});
