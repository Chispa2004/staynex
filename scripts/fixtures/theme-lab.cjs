// Isolated production-build fixture. Copies real presentation code, never env files
// or production API handlers. Authentication and database transports are synthetic.
const fs = require('node:fs');
const path = require('node:path');
exports.prepare = (root, lab) => {
  const d = path.join(lab, 'dashboard');
  fs.mkdirSync(d, {recursive:true});
  const put = (file, source) => { const target=path.join(d,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source); };
  for (const dir of ['components','lib','public']) fs.cpSync(path.join(root,'dashboard',dir),path.join(d,dir),{recursive:true});
  fs.cpSync(path.join(root,'shared'),path.join(lab,'shared'),{recursive:true});
  for (const file of ['package.json','jsconfig.json','tailwind.config.js','postcss.config.mjs']) fs.copyFileSync(path.join(root,'dashboard',file),path.join(d,file));
  if (!fs.existsSync(path.join(d,'node_modules'))) fs.symlinkSync(path.join(root,'dashboard/node_modules'),path.join(d,'node_modules'),'junction');
  put('next.config.mjs',`export default {reactStrictMode:true,outputFileTracingRoot:${JSON.stringify(root)}};`);
  for (const file of ['app/layout.js','app/globals.css','app/login/page.js','app/dashboard/page.js','app/dashboard/inbox/page.js','app/dashboard/tickets/page.js','app/dashboard/reservations/page.js','app/dashboard/health/page.js','app/dashboard/onboarding/page.js','app/dashboard/settings/pms/page.js']) put(file,fs.readFileSync(path.join(root,'dashboard',file),'utf8'));
  put('lib/supabase-browser.js',`const session={access_token:'synthetic-only',user:{id:'00000000-0000-4000-8000-000000000009',email:'qa@example.invalid'}};const channel={on(){return channel},subscribe(){return channel},unsubscribe(){}};const client={auth:{getSession:async()=>({data:{session:location.pathname==='/login'?null:session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>channel,removeChannel(){}};export const getSupabaseBrowser=()=>client;`);
  put('lib/lab-fixture.js',fs.readFileSync(path.join(root,'scripts/fixtures/theme-data.js'),'utf8'));
  put('app/api/executive-dashboard/route.js',fs.readFileSync(path.join(root,'scripts/fixtures/theme-dashboard-route.js'),'utf8'));
  put('app/api/inbox/route.js',fs.readFileSync(path.join(root,'dashboard/app/api/inbox/route.js'),'utf8').replace("from '@/lib/current-hotel'","from '@/lib/lab-fixture'").replace("from '@/lib/inbox'","from '@/lib/lab-fixture'"));
  for (const kind of ['tickets','reservations']) {
    let route = fs.readFileSync(path.join(root,`dashboard/app/api/${kind}/route.js`),'utf8').replace("from '@/lib/current-hotel'","from '@/lib/lab-fixture'");
    const write = route.indexOf('export async function POST');
    if (write >= 0) route = route.slice(0,write);
    put(`app/api/${kind}/route.js`,route);
  }
  put('app/api/[...route]/route.js',fs.readFileSync(path.join(root,'scripts/fixtures/theme-api.js'),'utf8'));
  // A visible variant probe exercises Tailwind's generated dark: rule on every OS preference.
  put('app/theme-probe/page.js',`'use client';import Link from 'next/link';import {ThemeToggle} from '@/components/ThemeToggle';export default function Page(){return <div className="p-5"><ThemeToggle/><p id="variant-probe" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">Tema explícito</p><Link href="/dashboard">Dashboard</Link></div>}`);
  return d;
};
