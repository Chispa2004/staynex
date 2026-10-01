const fs=require('node:fs'),path=require('node:path');
exports.prepare=(root,lab)=>{
  const d=require('./density-lab.cjs').prepare(root,lab);
  const put=(name,text)=>{const dest=path.join(d,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);};
  const auth=path.join(d,'lib/supabase-browser.js');
  // Only this isolated synthetic hotel exposes the existing demo form.
  fs.appendFileSync(path.join(d,'lib/lab-fixture.js'),"\nhotel.slug='hotel-demo-checkin';\n");
  const api=path.join(d,'app/api/[...route]/route.js');
  fs.writeFileSync(api,fs.readFileSync(api,'utf8').replace("==='/api/message-attention'", "==='/api/inbox/attention'").replace('canManage:false','canManage:true'));
  fs.writeFileSync(auth,fs.readFileSync(auth,'utf8').replace('getSession:async()',"signInWithPassword:async()=>({error:{message:'Acceso sintético rechazado'}}),getSession:async()"));
  put('app/accessibility-probe/page.js',`'use client';
import {useState} from 'react';import {HotelLifecycleDialog} from '@/components/HotelLifecycleDialog';
import {HotelWorkspaceSwitcher} from '@/components/HotelWorkspaceSwitcher';
import {useDashboardTheme} from '@/lib/theme/useDashboardTheme';
const hotels=[{hotel:{id:'00000000-0000-4000-8000-000000000001',name:'Hotel prueba A'},role:'admin'},{hotel:{id:'00000000-0000-4000-8000-000000000002',name:'Hotel prueba B'},role:'reception'}];
export default function Page(){const [open,setOpen]=useState(false),[current,setCurrent]=useState(hotels[0].hotel),{theme}=useDashboardTheme();return <section><h1 tabIndex={-1} data-lifecycle-focus>Confirmación sintética</h1><button onClick={()=>setOpen(true)}>Archivar hotel sintético</button>{open?<HotelLifecycleDialog hotel={{id:'00000000-0000-4000-8000-000000000001',name:'Hotel sintético'}} isLight={theme==='light'} onClose={()=>setOpen(false)} onSaved={()=>setOpen(false)}/>:null}<HotelWorkspaceSwitcher currentHotel={current} availableHotels={hotels} activeRole="admin" canSwitchWorkspaces canCreateWorkspaces onSwitch={id=>setCurrent(hotels.find(x=>x.hotel.id===id).hotel)} actorId="synthetic-only"/><button>Después del selector</button></section>}`);
  return d;
};
