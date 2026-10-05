import {test,expect} from '@playwright/test';
import {measureContrast,measureControl} from './fixtures/contrast-browser.js';
import fs from 'node:fs/promises';

const pages=['/dashboard','/dashboard/inbox','/dashboard/tickets','/dashboard/reservations','/dashboard/health','/dashboard/onboarding','/dashboard/settings/pms'];
test.beforeEach(async({context})=>{
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
for(const system of ['light','dark']) for(const selected of ['light','dark']) {
  test(`production CSS: system ${system}, explicit ${selected}; reload, direct entry and navigation`,async({page})=>{
    await page.emulateMedia({colorScheme:system,reducedMotion:'reduce'});
    await page.addInitScript(value=>localStorage.setItem('staynex_dashboard_theme',value),selected);
    await page.goto('/theme-probe');
    await expect(page.locator('html')).toHaveAttribute('data-theme',selected);
    await expect(page.locator('#variant-probe')).toHaveCSS('background-color',selected==='dark'?'rgb(15, 23, 42)':'rgb(255, 255, 255)');
    await expect(page.locator('#variant-probe')).toHaveCSS('color',selected==='dark'?'rgb(255, 255, 255)':'rgb(15, 23, 42)');
    await page.reload();
    await expect(page.locator('html')).toHaveCSS('color-scheme',selected);
    await page.getByRole('link',{name:'Dashboard',exact:true}).click();
    await expect(page.locator('[data-theme] section').first()).toBeVisible();
    await page.goto('/dashboard/inbox');
    await expect(page.getByRole('button',{name:selected==='dark'?'Cambiar a tema claro':'Cambiar a tema oscuro'}).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme',selected);
    expect(await page.evaluate(()=>localStorage.getItem('staynex_dashboard_theme'))).toBe(selected);
  });
}
test('production preference changes persist, first HTML paint uses stored theme, storage denial is safe',async({page})=>{
  await page.goto('/theme-probe');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('button',{name:'Cambiar a tema oscuro'}).first().click();
  await page.reload();
  await expect(page.locator('#variant-probe')).toHaveCSS('background-color','rgb(15, 23, 42)');
  await expect(page.getByRole('button',{name:'Cambiar a tema claro'}).first()).toHaveText(/Oscuro/);
  // Block hydration bundles: inline bootstrap still applies the stored theme,
  // and SSR never exposes protected content while initialization is pending.
  await page.route('**/_next/static/**/*.js',route=>route.abort());
  await page.goto('/dashboard');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('.theme-bootstrap')).toHaveCSS('background-color','rgb(10, 16, 27)');
  await expect(page.getByText('Hotel QA métricas · laboratorio aislado',{exact:true})).toHaveCount(0);
  await page.unroute('**/_next/static/**/*.js');
  await page.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(key==='staynex_dashboard_theme')throw Error('unavailable');return get.call(this,key)};Storage.prototype.setItem=function(key,value){if(key==='staynex_dashboard_theme')throw Error('unavailable');return set.call(this,key,value)}});
  await page.goto('/theme-probe');
  await page.getByRole('button',{name:'Cambiar a tema oscuro'}).first().click();
  await expect(page.locator('#variant-probe')).toHaveCSS('background-color','rgb(15, 23, 42)');
});
test('fresh OS-dark defaults light; selected dark keeps the access gate opaque without protected content',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/theme-probe');
  await expect(page.locator('#variant-probe')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await page.getByRole('button',{name:'Cambiar a tema oscuro'}).first().click();
  let release;
  const held=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/current-hotel',async route=>{await held;await route.continue();});
  try {
    await page.goto('/dashboard');
    const pending=page.locator('[data-workspace-loading]');
    await expect(pending).toBeVisible();
    await expect(pending.locator('main')).toHaveCSS('background-color','rgb(11, 16, 25)');
    await expect(page.getByRole('link',{name:/Mensajes recibidos/})).toHaveCount(0);
  } finally {release();}
  await expect(page.getByRole('link',{name:/Mensajes recibidos/})).toBeVisible();
});
for(const selected of ['light','dark']) for(const width of [1366,390]) {
  test(`production main screens: contrast ${selected} ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({colorScheme:selected==='light'?'dark':'light',reducedMotion:'reduce'});
    await page.addInitScript(value=>localStorage.setItem('staynex_dashboard_theme',value),selected);
    const evidence=[];
    for(const url of pages){
      const endpoint={'/dashboard':'/api/executive-dashboard','/dashboard/inbox':'/api/inbox','/dashboard/tickets':'/api/tickets?','/dashboard/reservations':'/api/reservations?','/dashboard/health':'/api/health/hotel','/dashboard/onboarding':'/api/onboarding/state','/dashboard/settings/pms':'/api/pms-connections'}[url];
      const response=page.waitForResponse(r=>r.url().includes(endpoint)&&r.status()===200);await page.goto(url);await response;await expect(page.locator('main').first()).toBeVisible();await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:/Consultando|Preparando|Comprobando/})).toHaveCount(0);
      console.log('Contrast screen',selected,width,url);
      if(url==='/dashboard/settings/pms') {
        // The response arrives before React reenables this button and its
        // disabled-opacity transition finishes. Measure the settled control.
        const refresh=page.getByRole('button',{name:'Actualizar estado',exact:true});
        await expect(refresh).toBeEnabled();await expect(refresh).toHaveCSS('opacity','1');
      }
      await expect.poll(async()=> (await page.evaluate(measureContrast)).length).toBeGreaterThan(20);
      const rows=await page.evaluate(measureContrast);
      expect(rows.length,`${url} rendered meaningful content`).toBeGreaterThan(20);
      evidence.push({url,rows});
    }
    await page.goto('/login');await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Login',exact:true})).toHaveCSS('opacity','1');
    evidence.push({url:'/login',rows:await page.evaluate(measureContrast)});
    await testInfo.attach('computed-contrast',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
    await fs.writeFile(testInfo.outputPath('computed-contrast.json'),JSON.stringify(evidence,null,2));
    const failures=evidence.flatMap(({url,rows})=>rows.filter(r=>!r.complex&&r.ratio<r.required).map(r=>({url,text:r.text,ratio:r.ratio,required:r.required,classes:r.classes})));
    console.log('Contrast failures',JSON.stringify(failures));expect(failures).toEqual([]);
  });
}

for(const selected of ['light','dark']) for(const width of [1366,390]) {
  test(`production dialogs, fields, menu and keyboard: ${selected} ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({colorScheme:selected==='light'?'dark':'light',reducedMotion:'reduce'});
    await page.addInitScript(value=>localStorage.setItem('staynex_dashboard_theme',value),selected);
    const evidence=[];
    const capture=async name=>{const rows=await page.evaluate(measureContrast);evidence.push({name,rows});return rows;};
    await page.goto('/dashboard/settings/pms');
    await page.getByRole('button',{name:'Configurar Mews',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('form')).toHaveCSS('background-color',selected==='dark'?'rgb(11, 16, 25)':'rgb(255, 255, 255)');
    await capture('PMS dialog');
    await page.getByRole('button',{name:'Guardar configuración',exact:true}).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await capture('PMS simulated save failure');
    const input=page.getByPlaceholder('Mews hotel/property ID');
    const field=await input.evaluate(measureControl);
    expect(field.borderInside).toBeGreaterThanOrEqual(3);expect(field.borderOutside).toBeGreaterThanOrEqual(3);
    await page.getByRole('button',{name:'Cerrar configuración PMS'}).press('Tab');
    const focus=await page.locator(':focus').evaluate(measureControl);
    expect(focus.outline).not.toBe('none');expect(focus.focusRatio).toBeGreaterThanOrEqual(3);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Configurar Mews',exact:true})).toBeFocused();
    await page.goto('/dashboard/inbox');
    const search=await page.getByRole('textbox',{name:'Buscar huésped, habitación, mensaje o idioma',exact:true}).locator('..').evaluate(measureControl);expect(search.borderInside).toBeGreaterThanOrEqual(3);expect(search.borderOutside).toBeGreaterThanOrEqual(3);
    await page.getByRole('button',{name:/^HS Huésped sintético 1 Habitación 200/}).click();
    await capture('Inbox conversation');
    await page.getByRole('button',{name:/^Asistencia IA/}).click();
    await expect(page.getByRole('dialog',{name:'Asistencia IA',exact:true})).toHaveCSS('background-color',selected==='dark'?'rgb(16, 26, 42)':'rgb(255, 255, 255)');
    await capture('Inbox assistance');
    await page.screenshot({path:testInfo.outputPath('inbox-assistance.png')});
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if(width===390){await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();}
    const marker=await page.locator('nav a[aria-current="page"] > span.absolute').evaluate(measureControl);expect(marker.fillRatio).toBeGreaterThanOrEqual(3);
    await page.getByRole('button',{name:'Idioma: Español',exact:true}).first().click();
    await capture('Language menu');
    await page.keyboard.press('Escape');
    await page.goto('/login');
    await expect(page.getByRole('button',{name:'Login',exact:true})).toHaveCSS('opacity','1');
    const loginField=await page.getByRole('textbox',{name:'Email',exact:true}).locator('..').evaluate(measureControl);
    expect(loginField.borderInside).toBeGreaterThanOrEqual(3);expect(loginField.borderOutside).toBeGreaterThanOrEqual(3);
    await fs.writeFile(testInfo.outputPath('controls-contrast.json'),JSON.stringify({evidence,field,focus,loginField,search,marker},null,2));
    const failures=evidence.flatMap(({name,rows})=>rows.filter(r=>!r.complex&&r.ratio<r.required).map(r=>({name,text:r.text,ratio:r.ratio,classes:r.classes})));
    console.log('Dialog contrast failures',JSON.stringify(failures));expect(failures).toEqual([]);
  });
}
