import fs from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {measureContrast,measureControl} from './fixtures/contrast-browser.js';
const paths=['/dashboard','/dashboard/inbox','/dashboard/tickets','/dashboard/reservations','/dashboard/onboarding','/dashboard/health','/platform/hotels'];
for(const theme of ['light','dark'])for(const width of [1920,1366,390])test(`shared chrome ${theme} ${width}: surfaces, navigation, menus and focus`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(t=>localStorage.setItem('staynex_dashboard_theme',t),theme);
 page.on('pageerror',e=>{throw e;});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const evidence=[];
 const captureContrast=async name=>{const rows=await page.evaluate(measureContrast);evidence.push({name,rows});expect(rows.filter(r=>r.chrome&&!r.complex&&r.ratio<r.required),name).toEqual([]);};
 for(const path of paths){
  await page.goto(path);await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);await expect(page.locator('main')).toBeVisible();
  if(path==='/dashboard')await expect(page.getByText('No hay mensajes entrantes.',{exact:true})).toBeVisible();
  if(path==='/dashboard/inbox')await expect(page.getByRole('textbox',{name:'Buscar huésped, habitación, mensaje o idioma'})).toBeVisible();
  if(path==='/platform/hotels')await expect(page.getByRole('heading',{name:'Hoteles',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))).toEqual({width,scroll:width});
  const sidebar=page.locator('#staynex-sidebar');
  if(width===390)await page.getByRole('button',{name:/^Abrir navegación$|^Abrir menú de navegación$/}).click();
  await expect(sidebar).toBeVisible();
  if(theme==='light'){
   await expect(sidebar).toHaveCSS('background-color','rgb(20, 36, 59)');await expect(sidebar).toHaveCSS('background-image','none');
   const active=sidebar.locator('nav a[aria-current="page"]');await expect(active).toHaveCSS('background-color','rgb(36, 61, 91)');
   const marker=await active.locator('span.absolute').evaluate(measureControl);expect(marker.fillRatio).toBeGreaterThanOrEqual(3);
   const icon=await active.locator('svg').evaluate(measureControl);expect(icon.iconRatio).toBeGreaterThanOrEqual(3);
  }
  await captureContrast(path);
  if(['/dashboard','/dashboard/inbox','/platform/hotels'].includes(path))await page.screenshot({path:info.outputPath(path.split('/').filter(Boolean).join('-')+'.png')});
  if(width===390){await page.keyboard.press('Escape');await expect(sidebar).toHaveAttribute('inert','');await expect(page.getByRole('button',{name:/^Abrir navegación$|^Abrir menú de navegación$/})).toBeFocused();}
 }
 await page.goto('/dashboard');await expect(page.getByText('No hay mensajes entrantes.',{exact:true})).toBeVisible();await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
 const sidebar=page.locator('#staynex-sidebar');
 if(width===390)await page.getByRole('button',{name:/^Abrir navegación$|^Abrir menú de navegación$/}).click();
 const teams=sidebar.getByRole('button',{name:'Equipos',exact:true});await teams.focus();await teams.press('Enter');await expect(teams).toHaveAttribute('aria-expanded','true');
 const link=sidebar.getByRole('link',{name:'Pisos',exact:true});await link.focus();expect((await link.evaluate(measureControl)).focusRatio).toBeGreaterThanOrEqual(3);await link.hover();await captureContrast('hover, group and keyboard focus');
 if(width!==390){
  await sidebar.getByRole('button',{name:'Contraer menú lateral'}).click();await expect(sidebar).toHaveCSS('width','72px');await sidebar.getByRole('link',{name:/^Inbox ·/}).focus();await expect(page.getByRole('tooltip')).toBeVisible();await captureContrast('compact navigation');await page.screenshot({path:info.outputPath('compact.png')});
  await sidebar.getByRole('button',{name:'Expandir menú lateral'}).click();await expect(sidebar).toHaveCSS('width','240px');
 }
 // Existing selector may be disabled when no other authorized hotel is available.
 const hotel=sidebar.locator('[data-icon-only] > button');await expect(hotel).toBeDisabled();if(theme==='light')await expect(hotel).toHaveCSS('border-top-style','dashed');
 if(width===390){
  const language=sidebar.getByRole('button',{name:'Idioma: Español',exact:true});await language.click();await language.press('Tab');await captureContrast('language popover');await page.keyboard.press('Escape');await expect(language).toBeFocused();await expect(sidebar).not.toHaveAttribute('inert','');await page.keyboard.press('Escape');await expect(sidebar).toHaveAttribute('inert','');
 }else{
  const language=page.getByRole('button',{name:'Idioma: Español',exact:true}).last();await language.click();await language.press('Tab');await captureContrast('header language popover');await page.keyboard.press('Escape');await expect(language).toBeFocused();
 }
 await fs.writeFile(info.outputPath('computed-contrast.json'),JSON.stringify(evidence,null,2));
 await info.attach('computed-contrast',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
});
for(const theme of ['light','dark'])for(const width of [1366,390])test(`hotel menu ${theme} ${width}: open, bounds and nested Escape`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(t=>localStorage.setItem('staynex_dashboard_theme',t),theme);
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/current-hotel',async r=>{const original=await r.fetch(),body=await original.json();await r.fulfill({json:{...body,canSwitchWorkspaces:true,directoryDeferred:false,availableHotels:[{hotel:body.hotel,role:'admin'},{hotel:{...body.hotel,id:'00000000-0000-4000-8000-000000000002',name:'Otro hotel sintético'},role:'receptionist'}]}});});
 await page.goto('/dashboard');await expect(page.getByText('No hay mensajes entrantes.',{exact:true})).toBeVisible();const nav=page.locator('#staynex-sidebar');
 if(width===390)await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();
 const trigger=nav.locator('[data-icon-only] > button');await trigger.focus();await trigger.press('Enter');const group=nav.getByRole('group',{name:'Cambiar hotel',exact:true});await expect(group).toBeVisible();
 const rows=await page.evaluate(measureContrast);await fs.writeFile(info.outputPath('menu-contrast.json'),JSON.stringify(rows,null,2));expect(rows.filter(r=>r.chrome&&!r.complex&&r.ratio<r.required)).toEqual([]);
 await page.screenshot({path:info.outputPath('hotel-menu.png')});await group.getByRole('button',{name:/Otro hotel sintético/}).focus();await page.keyboard.press('Escape');await expect(group).toHaveCount(0);await expect(trigger).toBeFocused();
 if(width===1366){await nav.getByRole('button',{name:'Contraer menú lateral'}).click();await trigger.click();await expect(group).toBeVisible();const bounds=await group.boundingBox();expect(bounds.width).toBeGreaterThan(200);expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);await page.screenshot({path:info.outputPath('compact-hotel-menu.png')});await page.keyboard.press('Escape');await expect(trigger).toBeFocused();}
 else {await expect(nav).not.toHaveAttribute('inert','');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Abrir navegación',exact:true})).toBeFocused();}
});
