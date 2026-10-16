const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({...(process.platform==='win32'?{channel:'msedge'}:{}),headless:true});
 try{
  for(const scenario of ['same-tab','new-tab','expired']){
   const context=await browser.newContext();
   await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:3399/invite')?route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic callback</title>'}):route.abort());
   const page=await context.newPage();
   await page.goto('http://127.0.0.1:3399/invite');
   await page.addScriptTag({path:path.resolve('node_modules/@supabase/supabase-js/dist/umd/supabase.js')});
   await page.addScriptTag({content:fs.readFileSync('dashboard/lib/invitation-session.js','utf8').replaceAll('export ','')});
   const result=await page.evaluate(async scenario=>{
    const user={id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z'};
    const token='a'.repeat(64);
    if(scenario!=='new-tab')sessionStorage.setItem(invitationTokenKey,token);
    const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'},'synthetic'].map(x=>btoa(typeof x==='string'?x:JSON.stringify(x)).replaceAll('=','')).join('.');
    history.replaceState(null,'',scenario==='expired'?'/invite#error=access_denied&error_code=otp_expired&error_description=private-detail':'/invite#access_token='+jwt+'&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=signup');
    let calls=0,unexpected=0;
    const client=supabase.createClient('http://127.0.0.1:3399','synthetic-anon',{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:true},global:{fetch:async url=>{
     calls++;if(!String(url).endsWith('/auth/v1/user')){unexpected++;throw Error('Unexpected transport');}
     return new Response(JSON.stringify(user),{status:200,headers:{'Content-Type':'application/json'}});
    }}});
    let value,error=false;
    try{value=await initializeInvitationSession({auth:client.auth,location,history,storage:sessionStorage});}catch{error=true;}
    client.auth.stopAutoRefresh();
    return {user:value?.user?.id||null,token:value?.token||sessionStorage.getItem(invitationTokenKey)||'',hash:location.hash,calls,unexpected,error};
   },scenario);
   assert.equal(result.hash,'');assert.equal(result.unexpected,0);
   assert.equal(result.token,scenario==='new-tab'?'':'a'.repeat(64));
   if(scenario==='expired')assert.equal(result.user,null);else {assert.equal(result.user,'00000000-0000-4000-8000-000000000001');assert(result.calls>=1);}
   console.log('PASS real Auth SDK synthetic callback '+scenario+': session recovered before cleanup, no acceptance, no external transport');
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
