// Production components, synthetic transport. The separate PostgreSQL suite
// executes the actual migration/locks; this fixture tests browser behaviour only.
const fs=require('node:fs'),path=require('node:path');
exports.prepare=d=>{
 const put=(file,text)=>{const p=path.join(d,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
 put('app/lifecycle-probe/page.js',`'use client';
import {useState} from 'react';import {TicketsTable} from '@/components/TicketsTable';import {MessageAttentionProvider,AttentionMessage,AttentionToolbar} from '@/components/MessageAttentionControls';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),hotelId=id(1),conversation={id:id(21),guest:{name:'Huésped sintético'},messages:[40,41,42].map(n=>({id:id(n),sender_type:'guest',content:n===42?'¿A qué hora empieza el desayuno?':n===40?'Dos toallas, por favor.':'Las dos son de baño.'}))};
const ticket={id:id(60),hotel_id:hotelId,conversation_id:conversation.id,title:'Dos toallas sintéticas',description:'Actuación simulada',status:'open',status_version:1,category:'housekeeping',priority:'normal'};
export default function Page(){const [key,setKey]=useState(0);return <section className="p-3 space-y-4"><h1>Ciclo de atención · laboratorio</h1><p>Simulación sin proveedores ni datos públicos</p><TicketsTable tickets={[ticket]} hotelId={hotelId}/><button onClick={()=>setKey(k=>k+1)}>Recargar seguimiento</button><MessageAttentionProvider key={key} hotelId={hotelId} conversation={conversation}><AttentionToolbar/>{conversation.messages.map(m=><article key={m.id}><p>{m.content}</p><AttentionMessage message={m}/></article>)}</MessageAttentionProvider></section>}`);
};
