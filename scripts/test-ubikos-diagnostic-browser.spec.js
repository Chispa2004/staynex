import {test,expect} from '@playwright/test';
import {createUbikosObservationHandler} from '../dashboard/lib/ubikos-observations-server.js';
import {createUbikosObservationReader} from '../src/services/pms/ubikos/observation-reader.js';
import {canAccess} from '../dashboard/lib/permissions.js';
const hotelId='00000000-0000-4000-8000-000000000001',connectionId='00000000-0000-4000-8000-000000000002';
for(const theme of ['light','dark'])for(const width of [1366,390])
test(`safe diagnostic reference and manual recovery ${theme} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.addInitScript(t=>localStorage.setItem('staynex_dashboard_theme',t),theme);
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const logs=[];let calls=0;
  const reader=createUbikosObservationReader({enabled:true,hotelId,connectionId,apiKey:'FICTIONAL-SECRET',
    fetchImpl:async()=>{calls++;return calls===1?Response.json({error:'FICTIONAL-SECRET',guest:'PRIVATE-FAKE-PERSON'},{status:400}):Response.json([]);}});
  const q={select(){return q;},eq(){return q;},limit:async()=>({data:[{id:connectionId,hotel_id:hotelId,
    provider:'ubikos',enabled:true,metadata:{property_id:'10318'}}]})};
  const handler=createUbikosObservationHandler({reader,canAccess,assertContext:()=>{},
    getContext:async()=>({user:{id:'synthetic'},role:'admin',hotel:{id:hotelId,name:'Hotel sintético'},
      supabase:{from:()=>q}}),logDiagnostic:entry=>logs.push(entry)});
  await page.route('**/api/pms-connections/ubikos/observations',async route=>{
    const r=route.request();
    const response=await handler(new Request(r.url(),{method:r.method(),headers:r.headers(),
      ...(r.method()==='POST'?{body:r.postData()}:{})}));
    await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  await page.goto('/dashboard/settings/pms/ubikos');
  const button=page.getByRole('button',{name:'Consultar manualmente',exact:true});
  await expect(button).toBeEnabled();expect(calls).toBe(0);
  await page.getByRole('combobox',{name:'Operación',exact:true}).selectOption('inhouse');
  await button.focus();await page.keyboard.press('Enter');
  const alert=page.locator('main').getByRole('alert');
  await expect(alert).toContainText('Referencia de diagnóstico');
  expect(calls).toBe(1);expect(logs).toHaveLength(1);
  await expect(alert).toContainText(logs[0].diagnosticId);
  await expect(alert).not.toContainText('400');
  for(const forbidden of ['FICTIONAL-SECRET','PRIVATE-FAKE-PERSON','UBIKOS_HTTP_FAILED'])
    await expect(page.locator('body')).not.toContainText(forbidden);
  await expect(button).toBeEnabled();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // A second synthetic query is deliberately initiated by the user, never automatic.
  await button.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Última lectura correcta'})).toBeVisible();
  await expect(alert).toHaveCount(0);expect(calls).toBe(2);
});
