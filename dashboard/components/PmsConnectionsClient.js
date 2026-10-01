'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PmsConnectionForm } from './PmsConnectionForm';
import { PmsProviderCard } from './PmsProviderCard';
import { getAuthHeaders } from '@/lib/auth-headers';
import { getActiveWorkspace, getWorkspaceRevision, WORKSPACE_ARCHIVED_EVENT, WORKSPACE_SELECTION_EVENT } from '@/lib/workspace-context';
import { createPmsRequestScope, pmsActions, validatePmsPayload } from '@/lib/pms-evidence';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const defaultForm = (provider, connection) => ({
  provider: provider.key, client_id: connection?.client_id || '', client_secret: '', api_key: '',
  account_code: connection?.account_code || connection?.metadata?.property_id || '',
  property_id: connection?.metadata?.property_id || connection?.account_code || '',
  base_url: connection?.base_url || provider.defaultBaseUrl || '',
  connection_mode: connection?.metadata?.connection_mode || provider.configurationMode || 'manual_setup',
  notes: connection?.metadata?.notes || '', enabled: connection?.enabled ?? true
});
const context = () => ({hotelId:getActiveWorkspace().hotelId,revision:getWorkspaceRevision()});
const formatTime = (date, language) => date ? new Date(date).toLocaleString(language) : '';

export const PmsConnectionsClient = ({embedded = false, onConfigurationChanged}) => {
  const {tx,language} = useDashboardLanguage();
  const {theme} = useDashboardTheme();
  const isLight = theme === 'light';
  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState(null);
  const [receivedAt,setReceivedAt] = useState(null);
  const [feedback,setFeedback] = useState(null);
  const [editing,setEditing] = useState(null);
  const [form,setForm] = useState(null);
  const [busy,setBusy] = useState(null);
  const [receipts,setReceipts] = useState({});
  const scope = useRef(createPmsRequestScope(context));
  const inFlight = useRef(false);
  const controller = useRef(null);
  const dataRef = useRef(null);
  // Unsaved fields stay in memory only while this authorized workspace is mounted.
  const drafts = useRef({});
  const clear = () => { drafts.current={};setData(null); dataRef.current=null; setReceivedAt(null); setLoadError(null); setEditing(null); setForm(null); setFeedback(null); setReceipts({}); };

  const request = async (url, options, ticket) => {
    const abort = new AbortController(); controller.current=abort;
    const timer=setTimeout(()=>abort.abort(),25000);
    try {
      const headers=await getAuthHeaders({hotelId:ticket.hotelId});
      if (!ticket.valid() || !ticket.hotelId) throw new Error('stale');
      const response=await fetch(url,{...options,headers:{...headers,'Content-Type':'application/json'},cache:'no-store',signal:abort.signal});
      const body=await response.json();
      if (!ticket.valid()) throw new Error('stale');
      if (!response.ok || body.ok !== true) throw new Error('pms_request_failed');
      if (body.hotelId !== ticket.hotelId) throw new Error('pms_invalid_response');
      return body;
    } finally {clearTimeout(timer); if(controller.current===abort)controller.current=null;}
  };

  const loadConnections = useCallback(async () => {
    if(inFlight.current)return;
    inFlight.current=true;
    const ticket=scope.current.begin();
    if(dataRef.current?.hotelId !== ticket.hotelId)clear();
    setLoading(true);setLoadError(null);
    try {
      const body=validatePmsPayload(await request('/api/pms-connections',{},ticket),ticket.hotelId);
      if(!ticket.valid())return;
      if(!body.canManage)drafts.current={};
      dataRef.current=body;setData(body);setReceivedAt(new Date().toISOString());
    } catch(error) {
      if(ticket.valid())setLoadError(error.name==='AbortError'?'La consulta ha tardado demasiado. Reintenta la actualización.':'No se pudo consultar el estado PMS. Reintenta la actualización.');
    } finally {if(ticket.valid()){setLoading(false);inFlight.current=false;}}
  },[]);

  useEffect(()=>{
    loadConnections();
    const changed=()=>{scope.current.invalidate();controller.current?.abort();inFlight.current=false;clear();setBusy(null);loadConnections();};
    window.addEventListener(WORKSPACE_SELECTION_EVENT,changed);
    window.addEventListener(WORKSPACE_ARCHIVED_EVENT,changed);
    const storage=event=>{if(event.key?.startsWith('staynex_'))changed();};
    window.addEventListener('storage',storage);
    return ()=>{scope.current.invalidate();controller.current?.abort();inFlight.current=false;window.removeEventListener(WORKSPACE_SELECTION_EVENT,changed);window.removeEventListener(WORKSPACE_ARCHIVED_EVENT,changed);window.removeEventListener('storage',storage);};
  },[loadConnections]);

  const canManage = Boolean(data?.canManage && !loading && !loadError && data.hotelId===context().hotelId);
  const openEditor = (provider,connection) => {
    if(!canManage||inFlight.current)return;
    setFeedback(null);setEditing({provider,connection});setForm(drafts.current[provider.key] || defaultForm(provider,connection));
  };
  const operate = async (action,provider,connection,payload) => {
    const allowed=pmsActions(provider,connection,canManage);
    if(inFlight.current || !(action==='test'?allowed.test:action==='sync'?allowed.sync:allowed.configure))return;
    inFlight.current=true;const ticket=scope.current.begin();
    setBusy({action,provider:provider.key});setFeedback(null);
    try {
      const url=action==='save'?'/api/pms-connections':action==='disconnect'?`/api/pms-connections?id=${encodeURIComponent(connection.id)}`:`/api/pms-connections/${action}`;
      const end=new Date();end.setDate(end.getDate()+90);
      const body=await request(url,{method:action==='disconnect'?'DELETE':'POST',...(action==='disconnect'?{}:{body:JSON.stringify(action==='save'?payload:{provider:provider.key,...(action==='sync'?{from:new Date().toISOString().slice(0,10),to:end.toISOString().slice(0,10),pageSize:50,maxReservations:1000}:{})})})},ticket);
      if(!ticket.valid())return;
      if(action==='save' || action==='disconnect'){
        if(body.connection?.hotel_id!==ticket.hotelId || body.connection?.provider!==provider.key)throw new Error('pms_invalid_response');
        delete drafts.current[provider.key];setEditing(null);setForm(null);setReceipts(current=>({...current,[provider.key]:{}}));
      } else {
        if(action==='test' && !(body.ok===true && body.connection?.sync_status==='connected' && body.connection?.hotel_id===ticket.hotelId && body.connection?.provider===provider.key))throw new Error('pms_invalid_response');
        if(action==='sync' && (!body.summary || !Array.isArray(body.summary.errors) || body.summary.status==='pending_setup'))throw new Error('pms_invalid_response');
        setReceipts(current=>({...current,[provider.key]:{...current[provider.key],[action]:{status:action==='test'?'success':body.summary.errors.length?'partial':'sync_success',at:new Date().toISOString(),receipt:true}}}));
      }
      setFeedback({type:'success',text:action==='save'?'Configuración guardada. No acredita conexión ni activa servicios.':action==='disconnect'?'Configuración deshabilitada.':'Resultado recibido. Revisa por separado la prueba y la sincronización.'});
    } catch(error) {
      if(!ticket.valid())return;
      const timeout=error.name==='AbortError';
      setFeedback({type:'error',text:timeout?'No se ha recibido confirmación. Actualiza el estado antes de reintentar.':'No se pudo confirmar la operación. Revisa el estado y vuelve a intentarlo.'});
      if(action==='test'||action==='sync')setReceipts(current=>({...current,[provider.key]:{...current[provider.key],[action]:{status:timeout?'timeout':'failed',at:new Date().toISOString(),receipt:true}}}));
    } finally {
      if(ticket.valid()){setBusy(null);inFlight.current=false;await loadConnections();if(ticket.hotelId===context().hotelId && ticket.revision===context().revision)await onConfigurationChanged?.();}
    }
  };

  return <section className="min-w-0 space-y-4" aria-label={tx('Conexiones PMS')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>{embedded?<h2 className={cn('text-2xl font-semibold',ui.text.title(isLight))}>{tx('PMS del hotel')}</h2>:<h1 className={cn('text-3xl font-semibold',ui.text.title(isLight))}>{tx('Conexiones PMS')}</h1>}
        <p className={ui.text.body(isLight)}>{tx('Configurar, comprobar y sincronizar son pasos distintos. Ninguno autoriza operación live.')}</p>
        {data?.hotel?.name?<p className={ui.text.muted(isLight)}>{data.hotel.name}</p>:null}
      </div>
      <button type="button" onClick={loadConnections} disabled={loading||Boolean(busy)} className={ui.button(isLight,'secondary')}>{tx(loading?'Consultando…':'Actualizar estado')}</button>
    </div>
    {embedded?<Link href="/dashboard/settings/pms" className="inline-block font-semibold underline">{tx('Abrir pantalla de conexiones PMS')}</Link>:<Link href="/dashboard/onboarding" className="inline-block font-semibold underline">{tx('Volver al asistente')}</Link>}
    <p className={ui.text.muted(isLight)}>{tx('Abrir o actualizar esta pantalla solo consulta datos guardados; no prueba proveedores ni sincroniza reservas.')}</p>
    {loadError?<div role="alert" className={ui.notice(isLight,'danger')}>{tx(loadError)} {data?tx('Se muestran datos anteriores; no acreditan el estado actual.'):tx('No hay información disponible para determinar el estado.')}</div>:null}
    {receivedAt?<p role="status" className={ui.text.muted(isLight)}>{tx('Datos recibidos')}: {formatTime(receivedAt,language)}</p>:null}
    {loading?<p role="status">{tx('Consultando configuración guardada…')}</p>:null}
    {feedback&&!editing?<div role={feedback.type==='error'?'alert':'status'} className={ui.notice(isLight,feedback.type==='error'?'danger':'success')}>{tx(feedback.text)}</div>:null}
    {data?<div className={embedded?'grid min-w-0 gap-4':'grid min-w-0 gap-4 xl:grid-cols-2'}>
      {data.providers.map(provider=><PmsProviderCard key={provider.key} provider={provider} connection={data.connections.find(c=>c.provider===provider.key)}
        canManage={canManage} permissionDenied={data.canManage === false} held={Boolean(data.operationsHeld)} busyAction={busy} receipt={receipts[provider.key]}
        onEdit={openEditor} onTest={(p,c)=>operate('test',p,c)} onSync={(p,c)=>operate('sync',p,c)} onDisconnect={(p,c)=>operate('disconnect',p,c)} />)}
    </div>:null}
    {editing?<PmsConnectionForm provider={editing.provider} initialConnection={editing.connection} form={form} setForm={setForm}
      onSave={event=>{event.preventDefault();operate('save',editing.provider,editing.connection,form);}}
      onClose={()=>{if(!busy){if(canManage)drafts.current[editing.provider.key]=form;setEditing(null);setForm(null);setFeedback(null);}}} saving={Boolean(busy)} error={feedback?.type==='error'?tx(feedback.text):null} />:null}
  </section>;
};
