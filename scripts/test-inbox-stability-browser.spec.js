import {writeFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'ignoreErrors'});});
const baseline=process.env.INBOX_BASELINE==='1';
const path='/dashboard/inbox?stage=stay&origin=simulated';
const sample=async(page,fn)=>{const start=Date.now();await fn();return Date.now()-start};
test.beforeEach(async({context})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
for(const width of [1366,390])for(const theme of ['light','dark'])test(`${width} ${theme}: stable selection, drafts, history and recoverable reads`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:900});
 await page.addInitScript(theme=>localStorage.setItem('staynex_dashboard_theme',theme),theme);
 let fail=false,detailDelay=0,apiReads=0,append=false;
 await page.route('**/api/inbox?*',async route=>{
   apiReads++;await new Promise(resolve=>setTimeout(resolve,180));
   if(fail && !route.request().url().includes('detail='))return route.fulfill({status:503,json:{error:'Fallo sintético recuperable'}});
   const response=await route.fetch();const body=await response.json();
   for(const c of body.conversations||[]){
     {const source=c.messages[0];c.messages=Array.from({length:40},(_,n)=>({...source,id:source.id+'-history-'+n,content:'Mensaje histórico sintético '+n}));if(append)c.messages.push({...source,id:source.id+'-new',content:'Actualización sintética nueva'});c.lastMessage=c.messages.at(-1);}
   }
   if(route.request().url().includes('detail='))await new Promise(resolve=>setTimeout(resolve,detailDelay));
   await route.fulfill({response,json:body});
 });
 await page.goto(path);
 const rows=page.locator('[data-inbox-conversation]');await expect(rows).toHaveCount(28);
 await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
 const actual=await page.evaluate(()=>({width:innerWidth,height:innerHeight,theme:document.documentElement.dataset.theme}));expect(actual.width).toBe(width);expect(actual.theme).toBe(theme);
 // Use a lower row and retain the actual list DOM node, not just its content.
 const last=rows.last();const selectedId=await last.getAttribute('data-inbox-conversation');
 await last.scrollIntoViewIfNeeded();
 const list=page.locator('aside .executive-scroll');
 const listBefore=await list.elementHandle();const before=await list.evaluate(n=>n.scrollTop);
 const clickMs=await sample(page,()=>last.click());await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toBeVisible();
 const after=await list.evaluate(n=>n.scrollTop);
 const retained=await listBefore.evaluate(n=>n.isConnected);
 writeFileSync(info.outputPath('selection.json'),JSON.stringify({actual,before,after,retained,clickMs,selectedId,apiReads},null,2));
 await info.attach('selection.json',{body:JSON.stringify({actual,before,after,retained,clickMs,selectedId,apiReads},null,2),contentType:'application/json'});
 await page.screenshot({path:info.outputPath('selection.png')});
 if(baseline)return;
 expect(retained).toBe(true);if(width>768)expect(Math.abs(after-before)).toBeLessThan(3);expect(page.url()).toContain('conversationId='+selectedId);expect(page.url()).toContain('stage=stay');expect(page.url()).toContain('origin=simulated');
 await page.getByRole('textbox',{name:'Respuesta al huésped'}).fill('Borrador privado del huésped 28');
 await page.getByRole('button',{name:'Volver a conversaciones',exact:true}).click();
 await expect(last).toBeFocused();expect(Math.abs(await list.evaluate(n=>n.scrollTop)-before)).toBeLessThan(3);
 await last.press('Enter');await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toHaveValue('Borrador privado del huésped 28');
 await page.goBack();await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toHaveCount(0);
 await page.goForward();await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toHaveValue('Borrador privado del huésped 28');
 // A tab focus rechecks authorization without unmounting authorized content.
 const composer=await page.getByRole('textbox',{name:'Respuesta al huésped'}).elementHandle();
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toHaveValue('Borrador privado del huésped 28');
 expect(await composer.evaluate(n=>n.isConnected)).toBe(true);
 // Reading old messages must survive an incoming update without scrolling down.
 const history=page.locator('[data-inbox-scroll-region="message-history"]');
 await history.evaluate(node=>{node.scrollTop=60;node.dispatchEvent(new Event('scroll'));});
 append=true;
 await page.getByRole('button',{name:'Actualizar',exact:true}).last().click();
 await expect(history.getByText('Actualización sintética nueva',{exact:true})).toHaveCount(1);
 expect(Math.abs(await history.evaluate(node=>node.scrollTop)-60)).toBeLessThan(3);
 fail=true;
 const refresh=page.waitForResponse(r=>r.url().includes('/api/inbox?view=summary')&&r.status()===503);
 await page.getByRole('button',{name:'Actualizar',exact:true}).last().click();await refresh;
 await expect(page.getByText('No se pudo actualizar el control. Actualiza antes de actuar.')).toBeVisible();
 await expect(rows).toHaveCount(28);await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toHaveValue('Borrador privado del huésped 28');
 fail=false;await page.getByRole('button',{name:'Actualizar',exact:true}).last().click();
 await expect(page.getByText('No se pudo actualizar el control. Actualiza antes de actuar.')).toHaveCount(0);
 await page.getByRole('button',{name:'Volver a conversaciones',exact:true}).click();
 detailDelay=600;
 await rows.nth(24).click();if(width===390)await page.getByRole('button',{name:'Volver a conversaciones',exact:true}).click();
 await rows.nth(25).click();
 await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toHaveValue('');
 await page.getByRole('textbox',{name:'Respuesta al huésped'}).fill('Borrador 26');
 if(width===390)await page.getByRole('button',{name:'Volver a conversaciones',exact:true}).click();
 await last.click();await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toHaveValue('Borrador privado del huésped 28');
 await expect(page.locator('main')).not.toContainText('Borrador 26');
 await page.screenshot({path:info.outputPath('recovered.png')});
});

test('three comparable trials: first entry, return, selection, refresh',async({page},info)=>{
 await page.setViewportSize({width:1366,height:900});
 let receivedAt=0;
 await page.route('**/api/inbox*',async route=>{await new Promise(resolve=>setTimeout(resolve,180));await route.continue();});
 page.on('response',r=>{if(new URL(r.url()).pathname==='/api/inbox' && !new URL(r.url()).searchParams.has('detail'))receivedAt=Date.now()});
 const samples=[];
 for(let n=0;n<3;n++){
   let start=Date.now();await page.goto(path);await expect(page.locator('[data-inbox-conversation]')).toHaveCount(28);
   const first={visual:Date.now()-start,newData:receivedAt-start};
   const row=page.locator('[data-inbox-conversation]').last();await row.scrollIntoViewIfNeeded();const detail=!baseline?page.waitForResponse(r=>new URL(r.url()).pathname==='/api/inbox' && new URL(r.url()).searchParams.has('detail')):null;start=Date.now();await row.click();await expect(page.getByRole('textbox',{name:'Respuesta al huésped'})).toBeVisible();
   const selection={visual:Date.now()-start,newData:null};if(detail){await detail;selection.newData=Date.now()-start;}
   const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/inbox' && !new URL(r.url()).searchParams.has('detail'));start=Date.now();await page.getByRole('button',{name:'Actualizar',exact:true}).last().click();const visual=Date.now()-start;await response;
   const refresh={visual,newData:receivedAt-start};
   await page.getByRole('link',{name:'Panel principal',exact:true}).click();await expect(page).toHaveURL(/\/dashboard$/);
   start=Date.now();await page.getByRole('link',{name:/^Inbox ·/}).click();await expect(page.locator('[data-inbox-conversation]')).toHaveCount(28);
   const returning={visual:Date.now()-start,newData:receivedAt-start};samples.push({first,selection,refresh,returning});
 }
 writeFileSync(info.outputPath('measurements.json'),JSON.stringify({baseline,latencyMs:180,viewport:{width:1366,height:900},samples},null,2));
 await info.attach('measurements.json',{body:JSON.stringify({baseline,latencyMs:180,viewport:{width:1366,height:900},samples},null,2),contentType:'application/json'});
});
for(const width of [1366,390])for(const theme of ['light','dark'])test(`${width} ${theme}: linked request evidence, copy is read-only and stale context is blocked`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.addInitScript(theme=>localStorage.setItem('staynex_dashboard_theme',theme),theme);
 let fail=false,delay=0;const writes=[];const tickets=new Map();
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/inbox/attention' && r.method()==='POST' && r.postDataJSON()?.action==='read')return; if(['POST','PUT','PATCH','DELETE'].includes(r.method()))writes.push(r.method()+' '+r.url());});
 await page.route('**/api/inbox?*',async route=>{
  const detail=new URL(route.request().url()).searchParams.has('detail');if(detail&&fail)return route.fulfill({status:503,json:{error:'Lectura sintética interrumpida'}});
  const response=await route.fetch(),body=await response.json();
  for(const c of body.conversations||[]){const guestId=c.guest_id||c.guest?.id||'synthetic-guest';c.guest_id=guestId;
   c.messages=[{...c.messages[0],id:'source-'+c.id,hotel_id:c.hotel_id,conversation_id:c.id,sender_type:'guest',original_language:'es',content:'Sigue la fuga del aire acondicionado. ¿Tenéis la incidencia?'}];c.lastMessage=c.messages[0];c.copilot=null;
   if(detail){const ticket={id:'request-'+c.id,hotel_id:c.hotel_id,guest_id:guestId,conversation_id:c.id,title:'Fuga verificada '+c.id,description:'Fuga del aire acondicionado; suelo mojado.',room_number:'QA-417',priority:'high',status:'open',category:'maintenance',request_context:{request_key:'air_conditioning',source_message_id:c.messages[0].id}};tickets.set(c.id,ticket);c.tickets=[ticket];c.operationalReceipts=[];c.ticketCoverage='ready';c.detailsLoaded=true;}
  }if(detail&&delay)await new Promise(r=>setTimeout(r,delay));await route.fulfill({response,json:body});
 });
 await page.goto(path);const rows=page.locator('[data-inbox-conversation]');await expect(rows).toHaveCount(28);const first=await rows.first().getAttribute('data-inbox-conversation');await rows.first().click();
 await page.getByRole('button',{name:/Asistencia IA/}).click();await expect(page.getByText('Prioridad del ticket',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Fuga verificada '+first,exact:true})).toBeVisible();await expect(page.getByText('La prioridad del ticket no crea una alerta urgente de mensaje.')).toBeVisible();
 const copy=page.getByRole('button',{name:'Copiar respuesta',exact:true});await expect(copy).toBeEnabled();
 const context=page.context();await context.grantPermissions(['clipboard-read','clipboard-write']);await copy.click();await expect(page.getByRole('button',{name:'Copiada',exact:true})).toBeVisible();expect(writes).toEqual([]);
 expect((await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))).width).toBe(width);
 await page.screenshot({path:info.outputPath('linked-request.png'),fullPage:true});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Volver a conversaciones',exact:true}).click();
 fail=true;await rows.nth(1).click();await page.getByRole('button',{name:/Asistencia IA/}).click();await expect(page.getByRole('button',{name:'Copiar respuesta',exact:true})).toBeDisabled();await expect(page.getByRole('link',{name:'Fuga verificada '+first,exact:true})).toHaveCount(0);await expect(page.getByRole('dialog').getByText('Asistencia IA sin actualizar.')).toBeVisible();
 fail=false;await page.getByRole('dialog').getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.getByRole('button',{name:'Copiar respuesta',exact:true})).toBeEnabled();expect(writes).toEqual([]);
});
