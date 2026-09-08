'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { getActiveTenantId, shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { WORKSPACE_SELECTION_EVENT } from '@/lib/workspace-context';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { isAttentionMessage, freezeAttentionOperation, acceptsAttentionResponse } from '../../shared/message-attention/contract.js';

const AttentionContext = createContext(null);
const labels = {pending:'Pendiente',resolved:'Resuelto',untracked:'Sin seguimiento anterior'};
export function MessageAttentionProvider({hotelId,conversation,children}) {
  const {theme} = useDashboardTheme();
  const [snapshot,setSnapshot] = useState(null);
  const [selected,setSelected] = useState([]);
  const [operation,setOperation] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [conflict,setConflict] = useState(false);
  const [notice,setNotice] = useState('');
  const generation = useRef(0);
  const readSequence = useRef(0);
  const latestRefresh = useRef(null);
  const busyRef = useRef(false);
  const dialog = useRef(null);
  const eligible = useMemo(() => [...new Map((conversation?.messages || []).filter(isAttentionMessage).map(m=>[m.id,m])).values()], [conversation?.messages]);
  const idsKey = eligible.map(m=>m.id).sort().join(',');
  const conversationId = conversation?.id;
  const invalidate = useCallback(() => {
    generation.current++; setSnapshot(null);setSelected([]);setOperation(null);setError('');setNotice('');setBusy(false);busyRef.current=false;
  },[]);
  const exchange = useCallback(async body => {
    const version = generation.current;
    if (!hotelId || (getActiveTenantId() && getActiveTenantId()!==hotelId)) throw new Error('El contexto cambió. Vuelve a abrir la conversación.');
    const headers = await getAuthHeaders({hotelId});
    const response = await fetch('/api/inbox/attention',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const payload = await response.json();
    const currentHeaders = await getAuthHeaders({hotelId});
    if (!acceptsAttentionResponse({generation:version,hotelId,authorization:headers.Authorization},
      {generation:generation.current,hotelId:getActiveTenantId()||hotelId,authorization:currentHeaders.Authorization})) return null;
    if (!response.ok) throw Object.assign(new Error(payload.error || 'Seguimiento no disponible'),{status:response.status});
    if (!shouldAcceptTenantPayload(payload,'message-attention') || payload.hotelId!==hotelId || payload.conversationId!==conversationId) return null;
    return payload;
  },[hotelId,conversationId]);
  const refresh = useCallback(async () => {
    if (!conversationId || !hotelId) return;
    const sequence=++readSequence.current;
    const version=generation.current;
    try {
      const data = await exchange({action:'read',conversationId,messageIds:idsKey ? idsKey.split(',') : []});
      if (data && sequence===readSequence.current && !busyRef.current) setSnapshot(data);
    } catch (caught) {if(version===generation.current && sequence===readSequence.current){setSnapshot(null);setError(caught.message);}}
  },[exchange,idsKey,conversationId,hotelId]);
  latestRefresh.current=refresh;
  useEffect(() => {
    refresh();
  },[refresh]);
  useEffect(() => () => {generation.current++;readSequence.current++;},[]);
  useEffect(() => {
    const clear = () => invalidate();
    window.addEventListener(WORKSPACE_SELECTION_EVENT,clear);
    let userId;
    const subscription = getSupabaseBrowser()?.auth.onAuthStateChange((event,session) => {
      if (event==='SIGNED_OUT' || (userId!==undefined && userId!==session?.user?.id)) clear();
      userId=session?.user?.id;
    });
    return () => {window.removeEventListener(WORKSPACE_SELECTION_EVENT,clear);subscription?.data?.subscription?.unsubscribe();};
  },[invalidate]);
  useEffect(() => { if (operation && dialog.current && !dialog.current.open) dialog.current.showModal(); },[operation]);
  const rows = new Map((snapshot?.items || []).map(item=>[item.messageId,item]));
  const prepare = (action,ids=selected) => {
    if (!snapshot?.canManage || busyRef.current) return;
    const observed = ids.map(id=>rows.get(id)).filter(Boolean);
    if (!observed.length || observed.length!==ids.length) return;
    try {
      const request = freezeAttentionOperation({conversationId,selected:observed,action,operationId:crypto.randomUUID()});
      setOperation({request,preview:ids.map(id=>({id,text:eligible.find(m=>m.id===id)?.content || 'Mensaje sin texto'}))});
      setError('');setNotice('');setConflict(false);
    } catch {setError('Selecciona entre 1 y 50 mensajes cargados.');}
  };
  const confirm = async () => {
    if (!operation || conflict || busyRef.current) return;
    busyRef.current=true;readSequence.current++;setBusy(true);setError('');
    const version=generation.current;
    try {
      const data=await exchange(operation.request);
      if (!data || version!==generation.current) return;
      if (operation.request.items.some(expected => !data.items.some(item=>item.messageId===expected.messageId && item.status===operation.request.action)))
        throw new Error('No se ha confirmado el alcance. Reintenta con la misma operación.');
      setSnapshot(current=>({...data,items:[...(current?.items || []).filter(item=>!data.items.some(next=>next.messageId===item.messageId)),...data.items]}));
      setSelected([]);setOperation(null);setNotice('Atención guardada.');setError('');
    } catch (caught) {
      if (version!==generation.current) return;
      setError(caught.message);
      if (caught.status===409) {setConflict(true);await refresh();}
    } finally {if(version===generation.current){busyRef.current=false;setBusy(false);latestRefresh.current?.();}}
  };
  const value={rows,selected,available:Boolean(snapshot),canManage:snapshot?.canManage===true,busy,prepare,
    toggle:id=>setSelected(current=>current.includes(id)?current.filter(item=>item!==id):current.length<50?[...current,id]:current),
    error,notice,refresh};
  return <AttentionContext.Provider value={value}>
    {children}
    {operation ? <dialog ref={dialog} aria-labelledby="attention-confirm-title" onCancel={event=>{if(busy)event.preventDefault();else setOperation(null);}}
      className={'w-[min(94vw,560px)] max-h-[85dvh] rounded-xl border p-5 shadow-xl backdrop:bg-neutral-950/50 '+(theme==='light'?'bg-white text-slate-900':'bg-slate-900 text-white')}>
      <h2 id="attention-confirm-title" className="text-lg font-semibold">{operation.request.action==='resolved'?'Marcar como resueltos':'Volver a pendiente'} ({operation.request.items.length})</h2>
      <p className="mt-2 text-sm">{operation.request.action==='resolved'
        ? 'Confirma que estos mensajes ya están atendidos. No envía una respuesta ni cierra los tickets relacionados.'
        : 'Estos mensajes volverán al seguimiento pendiente. No envía una respuesta ni cambia los tickets relacionados.'}</p>
      <p className="mt-2 text-xs">Solo los mensajes indicados de {conversation?.guest?.name || 'este huésped'}. Los nuevos mensajes quedan fuera.</p>
      <ul className="my-3 max-h-52 space-y-2 overflow-y-auto text-sm">{operation.preview.map(item=><li key={item.id} className="rounded border p-2">{item.text.slice(0,140)}</li>)}</ul>
      {error ? <p role="alert" className="my-2 text-sm">{error}</p>:null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={()=>{setOperation(null);setConflict(false);}} className="rounded border px-3 py-2">{conflict?'Cerrar y revisar':'Cancelar'}</button>
        <button type="button" disabled={busy || conflict} onClick={confirm} className="rounded border border-emerald-500 bg-emerald-50 px-3 py-2 font-medium text-emerald-900 disabled:opacity-50">{busy?'Guardando…':'Confirmar'}</button>
      </div>
    </dialog>:null}
  </AttentionContext.Provider>;
}
export function AttentionToolbar() {
  const value=useContext(AttentionContext);
  if(!value)return null;
  return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-xs" aria-label="Atención por mensaje">
    <span>{value.available?'Atención por mensaje':'Seguimiento no disponible'}</span>
    <button type="button" onClick={value.refresh} disabled={value.busy} className="rounded border px-2 py-1">Actualizar atención</button>
    {value.canManage && value.selected.length ? <>
      <span>{value.selected.length} seleccionados</span>
      <button type="button" disabled={value.busy} onClick={()=>value.prepare('resolved')} className="rounded border px-2 py-1">Marcar como resueltos ({value.selected.length})</button>
      <button type="button" disabled={value.busy} onClick={()=>value.prepare('pending')} className="rounded border px-2 py-1">Volver a pendiente ({value.selected.length})</button>
    </>:null}
    <span role="status">{value.notice}</span>
    {value.error ? <span role="alert">{value.error}</span>:null}
  </div>;
}
export function AttentionMessage({message}) {
  const value=useContext(AttentionContext);
  if(!value || !isAttentionMessage(message))return null;
  const state=value.rows.get(message.id);
  return <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-xs" data-message-attention={message.id}>
    {value.canManage && state ? <input type="checkbox" checked={value.selected.includes(message.id)} disabled={value.busy}
      onChange={()=>value.toggle(message.id)} aria-label={'Seleccionar mensaje: '+(message.content?.slice(0,70)||'Adjunto')} />:null}
    <span>{value.available && state?labels[state.status]:'Estado de atención no disponible'}</span>
    {value.canManage && state ? <>
      <button type="button" disabled={value.busy} onClick={()=>value.prepare(state.status==='resolved'?'pending':'resolved',[message.id])} className="rounded border px-2 py-1">{state.status==='resolved'?'Volver a pendiente':'Marcar como resuelto'}</button>
      {state.status==='untracked'?<button type="button" disabled={value.busy} onClick={()=>value.prepare('pending',[message.id])} className="rounded border px-2 py-1">Marcar pendiente</button>:null}
    </>:null}
    {state?.changedAt?<details className="max-w-full"><summary>Quién y cuándo</summary><p className="break-all">{state.actorKind==='inbound'?'Registro de entrada':state.changedBy} · {new Date(state.changedAt).toLocaleString()}</p></details>:null}
  </div>;
}
