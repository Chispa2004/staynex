const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const newAccount=process.argv.includes('--new-account');const ownerEmail=newAccount?'new-owner@example.invalid':'owner@example.invalid';
const out=path.resolve('.npm-cache/assisted-onboarding-evidence');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({...(process.platform==='win32'?{channel:'msedge'}:{}),headless:true});
 const context=await browser.newContext({viewport:{width:1366,height:900},permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>console.error('BROWSER',e.message));
 await page.goto('http://127.0.0.1:3390/lab');
 await page.getByRole('button',{name:'Usar cuenta Staynex sintética'}).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('assisted-lab-session')||'null')?.access_token);
 for(const [field,value] of Object.entries({name:newAccount?'Hotel sintético Sierra B':'Hotel sintético Costa A',admin_email:ownerEmail,country_code:'ES',city:'Madrid',timezone:'Europe/Madrid'}))
  await page.locator('#create-hotel-'+field).fill(value);
 const createdPromise=page.waitForResponse(r=>r.url().endsWith('/api/platform/hotels')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Crear workspace de hotel',exact:true}).click();
 console.log('After create',await page.locator('body').innerText());
 const response=await createdPromise;const created=await response.json();assert.equal(response.status(),201,JSON.stringify(created));
 assert.equal(created.hotel.ai_auto_reply_enabled,false);assert.equal(created.hotel.hotel_live_mode,false);
 await page.getByRole('button',{name:'Generar enlace nuevo'}).click();
 await page.getByRole('button',{name:'Copiar enlace',exact:true}).click();
 const link=await page.evaluate(()=>navigator.clipboard.readText());
 assert(link.startsWith('http://127.0.0.1:3390/invite#token='));
 await page.waitForTimeout(350);
   await page.screenshot({path:path.join(out,'invitation-admin-1366-light.png'),fullPage:true});
 await page.goto(link);await page.getByRole('button',{name:'Comprobar invitación'}).click();
 await page.getByRole('alert').filter({hasText:'no está disponible para esta cuenta'}).waitFor();
 await page.getByRole('button',{name:'Cambiar de cuenta'}).click();
 await page.getByLabel('Correo electrónico',{exact:true}).fill(ownerEmail);
 await page.getByLabel('Contraseña',{exact:true}).fill('synthetic-password');
 if(newAccount){
  await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Revisa el correo'}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Comprobar invitaci/}).count(),0);
  await page.getByRole('button',{name:/Iniciar sesi/,exact:true}).waitFor();
  // Simulated Auth email delivery; never an invitation acceptance or remote Auth operation.
  await page.request.post('http://127.0.0.1:3390/api/lab-auth',{data:{action:'verify',email:ownerEmail}});
  await page.getByLabel('Correo electrónico',{exact:true}).fill(ownerEmail);
  await page.getByLabel('Contraseña',{exact:true}).fill('synthetic-password');
 }
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await page.getByRole('button',{name:'Comprobar invitación'}).click();
 await page.getByRole('button',{name:'Aceptar invitación',exact:true}).waitFor();
 for(const width of [1366,390])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:900});
   await page.evaluate(theme=>{localStorage.setItem('staynex_dashboard_theme',theme);},theme); // Toggle via existing control below, then verify.
   const toggle=page.getByRole('button',{name:theme==='dark'?'Cambiar a tema oscuro':'Cambiar a tema claro',exact:true});
   if(await toggle.count())await toggle.click();
   await page.waitForTimeout(350);
   await page.screenshot({path:path.join(out,'invitation-'+width+'-'+theme+'.png'),fullPage:true});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'invitation overflow');
 }
 if(!newAccount){let drop=true;await context.route('**/api/access-invitations',async route=>{
  if(drop&&route.request().postDataJSON()?.accept){drop=false;await route.fetch();await route.abort();}else await route.continue();
 });}
 await page.getByRole('button',{name:'Aceptar invitación',exact:true}).focus();await page.keyboard.press('Enter');
 if(!newAccount){await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Comprobar invitación'}).click();}
 await page.getByRole('status').filter({hasText:'Acceso aceptado'}).waitFor();
 await page.reload();
 await page.getByRole('button',{name:'Comprobar invitación'}).click();
 await page.getByRole('status').filter({hasText:'Acceso aceptado'}).waitFor();
 assert((await page.getByRole('link',{name:'Completar los datos del hotel'}).getAttribute('href')).includes(created.hotel.id));
 await page.getByRole('link',{name:'Completar los datos del hotel'}).click();
 await page.waitForURL(/dashboard\/onboarding/);
 await page.getByRole('heading',{name:'Completa los datos de tu hotel',exact:true}).first().waitFor();
 console.log('HOTEL',created.hotel.id);
 fs.writeFileSync(path.join(out,newAccount?'state-new.json':'state.json'),JSON.stringify({hotelId:created.hotel.id,owner:await context.storageState()},null,2));
 console.log((await page.locator('body').innerText()).slice(-12000));
 await page.screenshot({path:path.join(out,'onboarding-initial.png'),fullPage:true});
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
