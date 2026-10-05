import {test,expect} from '@playwright/test';

test.afterEach(async({},info)=>{if(info.errors.length)console.log(info.errors.map(e=>e.message).join('\n'));});

test.beforeEach(async({context})=>{
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
const ready=async(page,url)=>{
  const endpoints={'/dashboard':'/api/executive-dashboard','/dashboard/inbox':'/api/inbox','/dashboard/tickets':'/api/tickets?','/dashboard/reservations':'/api/reservations?','/dashboard/health':'/api/health/hotel','/dashboard/onboarding':'/api/onboarding/state','/dashboard/settings/pms':'/api/pms-connections'};
  const response=endpoints[url] ? page.waitForResponse(r=>r.url().includes(endpoints[url])&&r.status()===200) : null;
  await page.goto(url);
  if(response)await response;
  await expect(page.locator('[data-workspace-loading]')).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
};
const namedFields=async page=>{
  for(const role of ['button','textbox','combobox','spinbutton']) {
    for(const control of await page.getByRole(role).all()) {
      if(await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
    }
  }
  const missing=await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(fields=>fields.filter(f=>f.getClientRects().length&&!f.disabled&&!f.labels?.length&&!f.getAttribute('aria-labelledby')).map(f=>({tag:f.tagName,placeholder:f.placeholder,name:f.getAttribute('aria-label')})));
  expect(missing,'Fields need an associated label, not just placeholder or aria-label').toEqual([]);
};
const trapped=async(page,dialog)=>{
  for(let n=0;n<35;n++) {await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
  for(let n=0;n<3;n++) {await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
};

for(const theme of ['light','dark']) for(const width of [1366,390]) {
  test(`names, labels and keyboard across main routes ${theme} ${width}`,async({page},info)=>{
    await page.setViewportSize({width,height:844});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(t=>localStorage.setItem('staynex_dashboard_theme',t),theme);
    for(const path of ['/dashboard','/dashboard/inbox','/dashboard/tickets','/dashboard/reservations','/dashboard/health','/dashboard/onboarding','/dashboard/settings/pms','/login']) {
      await ready(page,path);
      if(path==='/login')await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled();
      else await expect(page.locator('main').getByText(/Preparando|Consultando registros/)).toHaveCount(0);
      await namedFields(page);
      await page.screenshot({path:info.outputPath(path.replaceAll('/','-')+'.png')});
    }
    await ready(page,'/dashboard/tickets');
    const help=page.getByText('Acerca de estos resultados',{exact:true});
    await help.focus();await page.keyboard.press('Enter');await expect(page.locator('details[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');await expect(page.locator('details[open]')).toHaveCount(0);await expect(help).toBeFocused();
    const filter=page.getByRole('combobox',{name:'Estado',exact:true});await filter.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(filter).toBeFocused();
    await ready(page,'/dashboard/reservations');
    const create=page.getByRole('button',{name:'Crear reserva demo',exact:true});await create.focus();await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog',{name:'Crear reserva demo',exact:true});await expect(dialog).toBeVisible();await namedFields(page);await trapped(page,dialog);
    await dialog.getByLabel('Nombre del huésped',{exact:true}).fill('Borrador sintético');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(create).toBeFocused();
    await create.click();await expect(dialog.getByLabel('Nombre del huésped',{exact:true})).toHaveValue('Borrador sintético');await page.keyboard.press('Escape');
    await ready(page,'/dashboard/settings/pms');const configure=page.getByRole('button',{name:'Configurar Mews',exact:true});await configure.click();
    const pms=page.getByRole('dialog');await expect(pms).toBeVisible();await namedFields(page);await trapped(page,pms);
    const field=pms.getByLabel('Identificador del establecimiento',{exact:true});await field.fill('QA-borrador');await pms.getByRole('button',{name:'Guardar configuración',exact:true}).click();await expect(pms.getByRole('alert')).toBeVisible();await expect(field).toHaveValue('QA-borrador');await expect(pms.locator('form')).toHaveAccessibleDescription(/No se pudo confirmar la operación/);
    await page.keyboard.press('Escape');await expect(pms).toHaveCount(0);await expect(configure).toBeFocused();
    await configure.click();await expect(field).toHaveValue('QA-borrador');await page.keyboard.press('Escape');
    await ready(page,'/dashboard/inbox');const conversation=page.getByRole('button',{name:/^HS Huésped sintético 1 Habitación 200/});await conversation.focus();await page.keyboard.press('Enter');
    const back=page.getByRole('button',{name:'Volver a conversaciones',exact:true});if(width===390)await expect(back).toBeFocused();
    const reply=page.getByRole('textbox',{name:'Respuesta al huésped',exact:true});await reply.fill('Borrador que Escape conserva');await reply.press('Escape');await expect(reply).toHaveValue('Borrador que Escape conserva');
    const options=page.locator('[data-message-attention]').first().locator('summary');await options.press('Enter');
    const attentionAction=page.locator('[data-message-attention]').first().getByRole('button',{name:/Marcar como resuelto|Volver a pendiente/});await attentionAction.click();
    const confirmation=page.getByRole('dialog');await expect(confirmation).toBeVisible();await trapped(page,confirmation);await page.keyboard.press('Escape');await expect(confirmation).toHaveCount(0);await expect(options).toBeFocused();
    const assist=page.getByRole('button',{name:/^Asistencia IA(?: \d+)?$/});await assist.click();const panel=page.getByRole('dialog',{name:'Asistencia IA',exact:true});await trapped(page,panel);await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(assist).toBeFocused();await expect(reply).toHaveValue('Borrador que Escape conserva');
    await back.click();await expect(conversation).toBeFocused();
    if(width===390){
      const open=page.getByRole('button',{name:'Abrir navegación',exact:true});await open.click();const nav=page.getByRole('dialog',{name:'Navegación principal',exact:true});await trapped(page,nav);
      const language=nav.getByRole('button',{name:'Idioma: Español',exact:true});await language.click();await language.press('Tab');await page.keyboard.press('Escape');await expect(nav).toBeVisible();await expect(language).toBeFocused();await expect(language).toHaveAttribute('aria-expanded','false');
      await page.keyboard.press('Escape');await expect(nav).toHaveCount(0);await expect(open).toBeFocused();
    }
  });
}

test('field errors, native row actions and confirmation fallback remain usable',async({page})=>{
  await ready(page,'/dashboard/onboarding');
  const name=page.getByLabel('Nombre del hotel',{exact:false});await name.fill('');await page.getByRole('button',{name:'Guardar hotel',exact:true}).click();await expect(name).toHaveAttribute('aria-invalid','true');await expect(name).toHaveAccessibleDescription(/obligatorio|vacío|nombre|requerido/i);
  await ready(page,'/dashboard/tickets');
  await page.route('http://127.0.0.1:3364/api/tickets/*/status',r=>r.fulfill({status:503,json:{error:'Synthetic save failure'}}));
  const action=page.locator('tbody tr').first().getByRole('button',{name:'En curso',exact:true});
  const update=page.waitForResponse(r=>r.url().includes('/status')&&r.request().method()==='PATCH');
  await action.press('Enter');await update;await expect(action).toBeEnabled();await expect(page).toHaveURL(/\/dashboard\/tickets$/);
  const ticket=page.locator('tbody').getByRole('link').first();await expect(ticket).toHaveAccessibleName(/QA/);await ticket.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/dashboard\/tickets\/000/);
  await ready(page,'/dashboard/reservations');const rowButton=page.locator('tbody tr').first().getByRole('button').first();await rowButton.focus();await page.keyboard.press('Space');await expect(rowButton).toHaveAttribute('aria-pressed','true');
  await ready(page,'/accessibility-probe');const opener=page.getByRole('button',{name:'Archivar hotel sintético',exact:true});await opener.click();const confirmation=page.getByRole('dialog');await trapped(page,confirmation);await opener.evaluate(e=>e.remove());await page.keyboard.press('Escape');await expect(confirmation).toHaveCount(0);await expect(page.getByRole('heading',{name:'Confirmación sintética'})).toBeFocused();
  await ready(page,'/login');await page.getByRole('textbox',{name:'Email',exact:true}).fill('qa@example.invalid');await page.getByLabel('Password',{exact:true}).fill('synthetic-only');await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Acceso sintético rechazado'})).toHaveText('Acceso sintético rechazado');await expect(page.getByLabel('Password',{exact:true})).toHaveAccessibleDescription('Acceso sintético rechazado');
});

test('workspace selector retains drafts and supports native keyboard selection',async({page})=>{
  await ready(page,'/accessibility-probe');
  const selector=page.getByRole('button',{name:'Hotel prueba A · Admin',exact:true});
  await selector.press('Enter');
  await page.getByRole('button',{name:'Crear nuevo hotel',exact:true}).click();
  await namedFields(page);
  const name=page.getByRole('textbox',{name:'Nombre del hotel',exact:true});await name.fill('Borrador de hotel');
  await name.press('Escape');await expect(selector).toBeFocused();await expect(selector).toHaveAttribute('aria-expanded','false');
  await selector.press('Enter');await expect(name).toHaveValue('Borrador de hotel');
  const second=page.getByRole('button',{name:/Hotel prueba B/});await second.press('Space');
  await expect(page.getByRole('button',{name:'Hotel prueba B · Admin',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Hotel prueba B · Admin',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Después del selector'}).focus();await expect(name).toHaveCount(0);
});

test('eleven metric cards have names and open their detail using Enter',async({page})=>{
  for(const [route,names] of [
    ['/dashboard',['Mensajes recibidos','Mensajes resueltos','Mensajes pendientes','Mensajes urgentes']],
    ['/dashboard/tickets',['Riesgo urgente','Satisfacción en riesgo','Priorizados por IA']],
    ['/dashboard/reservations',['Reservas totales','Llegan pronto','Alojados ahora','Estancias completadas']]
  ]) for(const name of names){
    await ready(page,route);
    const card=page.getByRole('link',{name:new RegExp('^'+name)});
    const href=await card.getAttribute('href');expect(href).toContain('metric=');
    await card.press('Enter');await expect(page).toHaveURL(new URL(href,page.url()).href);
  }
});

test('wide Inbox panel is non-modal and data refresh does not steal focus',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});await ready(page,'/dashboard/inbox');await page.getByRole('button',{name:/^HS Huésped sintético 1 Habitación 200/}).click();await page.getByRole('button',{name:/^Asistencia IA(?: \d+)?$/}).click();
  const panel=page.getByRole('dialog',{name:'Asistencia IA',exact:true});await expect(panel).toBeVisible();
  const search=page.getByRole('textbox',{name:'Buscar huésped, habitación, mensaje o idioma',exact:true});await search.focus();await expect(search).toBeFocused();await panel.getByRole('button').first().focus();await page.keyboard.press('Shift+Tab');expect(await panel.evaluate(e=>e.contains(document.activeElement))).toBe(false);
  await panel.getByRole('button').first().focus();await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^Asistencia IA(?: \d+)?$/})).toBeFocused();
  const refresh=page.getByRole('button',{name:'Actualizar',exact:true}).last();await refresh.focus();await expect(refresh).toBeFocused();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/inbox'&&!new URL(r.url()).searchParams.has('detail')&&r.status()===200);await refresh.press('Enter');await response;await expect(page.getByRole('textbox',{name:'Respuesta al huésped',exact:true})).toBeVisible();await expect(refresh).toBeFocused();
});
