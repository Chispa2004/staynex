// Isolated UI + actual Next handlers + actual PostgreSQL contract. No production credentials.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),runtime=path.join(root,'.npm-cache/organization-onboarding/runtime');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k)));
Object.assign(env,{NEXT_PUBLIC_STAYNEX_LOCAL_REVIEW:'1',NEXT_TELEMETRY_DISABLED:'1',SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true',GUEST_MEMORY_ENABLED:'false',AUTOMATION_TEST_SEND_ENABLED:'false',SUPABASE_SERVICE_ROLE_KEY:'local-service-fixture',NODE_OPTIONS:`--require "${path.join(root,'scripts/ci/isolate.cjs').replaceAll('\\','/')}"`});
(async()=>{
 const fixture=await require('../fixtures/organization-onboarding-db.cjs').start(env);
 const files=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>/^(dashboard|shared|src|scripts)\//.test(f)&&!/(^|\/)\.env($|\.)/.test(f));
 const manifest=[];
 for(const file of files){const target=path.join(runtime,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);manifest.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')});}
 for(const folder of ['node_modules','dashboard/node_modules']){const dest=path.join(runtime,folder);if(!fs.existsSync(dest))fs.symlinkSync(path.join(root,folder),dest,'junction');}
 fs.copyFileSync(path.join(root,'package.json'),path.join(runtime,'package.json'));
 const adapter=fs.readFileSync(path.join(root,'.npm-cache/inbox-redesign/runtime/dashboard/lib/supabase-browser.js'),'utf8')
  .replace("access_token: 'local-review-token'","access_token: 'onboarding-' + (localStorage.getItem('onboarding-profile') || 'staynex')")
  .replace("id: 'local-review-user'","id: ({staynex:101,cadena:102,direccion:103,recepcion:104,independiente:105,otra:106,invitado:107}[localStorage.getItem('onboarding-profile') || 'staynex']).toString().padStart(12,'0').replace(/^/, '00000000-0000-4000-8000-')");
 fs.writeFileSync(path.join(runtime,'dashboard/lib/supabase-browser.js'),adapter);
 fs.writeFileSync(path.join(runtime,'dashboard/components/OnboardingLab.js'),`'use client';
 import { useEffect, useState } from 'react';
 export function OnboardingLab(){const [profile,setProfile]=useState('staynex');useEffect(()=>setProfile(localStorage.getItem('onboarding-profile')||'staynex'),[]);return <aside style={{position:'sticky',top:0,zIndex:99999,background:'#fef08a',color:'#422006',padding:'10px 20px',fontSize:14}}>LABORATORIO SINTÉTICO · handlers reales + PostgreSQL desechable · sin proveedores <label> Cuenta de prueba <select value={profile} onChange={e=>{localStorage.clear();localStorage.setItem('staynex_dashboard_theme','light');localStorage.setItem('onboarding-profile',e.target.value);document.cookie='staynex_active_hotel_id=; Max-Age=0; path=/';location.assign(e.target.value==='staynex'?'/platform/organizations':'/my-hotels');}}>{${JSON.stringify(Object.keys(fixture.identities))}.map(p=><option key={p}>{p}</option>)}</select></label></aside>}`);
 const layout=path.join(runtime,'dashboard/app/layout.js');fs.writeFileSync(layout,fs.readFileSync(layout,'utf8').replace("import './globals.css';","import './globals.css';\nimport { OnboardingLab } from '@/components/OnboardingLab';").replace('<body>','<body><OnboardingLab />'));
 fs.writeFileSync(path.join(runtime,'dashboard/public/review-build.json'),JSON.stringify({sha:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:manifest,adapters:['dashboard/app/layout.js','dashboard/lib/supabase-browser.js','dashboard/components/OnboardingLab.js']},null,2));
 env.SUPABASE_URL=`http://127.0.0.1:${fixture.port}`;
 console.log('UI real + PostgreSQL: http://127.0.0.1:3342/platform/organizations');
 const child=cp.spawn(process.execPath,[path.join(runtime,'dashboard/node_modules/next/dist/bin/next'),'dev','-H','127.0.0.1','-p','3342'],{cwd:path.join(runtime,'dashboard'),env,stdio:'inherit'});
 let closing=false;const close=async()=>{if(closing)return;closing=true;child.kill();fs.writeFileSync(path.join(root,'.npm-cache/organization-onboarding/requests.json'),JSON.stringify(fixture.calls,null,2));await fixture.close();};
 process.on('SIGINT',async()=>{await close();process.exit(0);});process.on('SIGTERM',async()=>{await close();process.exit(0);});child.on('exit',async(code)=>{await close();process.exit(code||0);});
})().catch(error=>{console.error(error);process.exitCode=1;});
