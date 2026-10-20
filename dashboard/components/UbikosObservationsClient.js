'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {getAuthHeaders} from '@/lib/auth-headers';
import {getActiveWorkspace, getWorkspaceRevision, WORKSPACE_SELECTION_EVENT, WORKSPACE_ARCHIVED_EVENT} from '@/lib/workspace-context';
import {createPmsRequestScope} from '@/lib/pms-evidence';
import {useDashboardTheme} from '@/lib/theme/useDashboardTheme';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
import {cn, ui} from '@/lib/ui/styles';

const endpoint = '/api/pms-connections/ubikos/observations';
const messages = {
  ACCESS_DENIED: 'No tienes permiso para consultar este hotel.',
  BINDING_REQUIRED: 'Revisa la vinculación Ubikos del hotel en Conexiones PMS.',
  REQUEST_INVALID: 'Revisa la operación, la fecha y la conexión seleccionadas.',
  SERVER_READING_UNAVAILABLE: 'La lectura desde este servidor todavía no está habilitada.',
  READ_FAILED: 'No se pudo completar la lectura. Puedes volver a intentarlo manualmente.',
  STRUCTURE_INVALID: 'La respuesta no tiene una estructura interpretable.'
};
const issueLabels = {
  UNMAPPED_FIELDS_OMITTED: 'Se han omitido campos todavía no mapeados.',
  ROOM_REFERENCE_EMPTY: 'La referencia de habitación está vacía.',
  ROOM_REFERENCE_MISSING: 'No se ha recibido referencia de habitación.',
  ROOM_REFERENCE_INVALID: 'La referencia de habitación no tiene un formato válido.',
  BOOKING_ID_MISSING: 'Falta el identificador de reserva.',
  BOOKING_ID_INVALID: 'El identificador de reserva no es un entero seguro.',
  ROW_INVALID: 'La fila no tiene una estructura válida.'
};
const workspace = () => ({hotelId: getActiveWorkspace().hotelId, revision: getWorkspaceRevision()});
export function UbikosObservationsClient() {
  const {theme} = useDashboardTheme(); const light = theme === 'light';
  const {tx, language} = useDashboardLanguage();
  const [binding, setBinding] = useState(null), [result, setResult] = useState(null);
  const [operation, setOperation] = useState('checkin'), [date, setDate] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const scope = useRef(createPmsRequestScope(workspace)), abort = useRef(null), pending = useRef(false);
  const clear = () => {setBinding(null);setResult(null);setError(null);};
  const send = async (method, body, ticket) => {
    const controller = new AbortController(); abort.current = controller;
    const timeout = setTimeout(()=>controller.abort(), 15000);
    try {
      const headers = await getAuthHeaders({hotelId: ticket.hotelId});
      if (!ticket.valid() || !ticket.hotelId) throw Error('stale');
      const response = await fetch(endpoint, {method, headers: {...headers, 'Content-Type':'application/json'},
        ...(body ? {body: JSON.stringify(body)} : {}), cache:'no-store', signal:controller.signal});
      const data = await response.json();
      if (!ticket.valid()) throw Error('stale');
      if (!response.ok || !data.ok) throw Object.assign(Error('safe'), {code: data.code, status: response.status,
        diagnosticId:/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.diagnosticId||'')?data.diagnosticId:null});
      if (data.hotelId !== ticket.hotelId) throw Object.assign(Error('safe'), {code:'ACCESS_DENIED',status:403});
      return data;
    } finally {clearTimeout(timeout);}
  };
  useEffect(()=>{
    const load = async () => {
      scope.current.invalidate();abort.current?.abort();pending.current=true;clear();setBusy(true);
      const ticket=scope.current.begin();
      try {const data=await send('GET',null,ticket);if(ticket.valid())setBinding(data);}
      catch(e) {if(ticket.valid())setError({message:messages[e.code] || messages.READ_FAILED,diagnosticId:e.diagnosticId});}
      finally {if(ticket.valid()){pending.current=false;setBusy(false);}}
    };
    load();
    const storage=e=>{if(!e.key || e.key.startsWith('staynex_'))load();};
    window.addEventListener(WORKSPACE_SELECTION_EVENT,load);
    window.addEventListener(WORKSPACE_ARCHIVED_EVENT,load);
    window.addEventListener('storage',storage);
    return ()=>{scope.current.invalidate();abort.current?.abort();window.removeEventListener(WORKSPACE_SELECTION_EVENT,load);
      window.removeEventListener(WORKSPACE_ARCHIVED_EVENT,load);window.removeEventListener('storage',storage);};
  },[]);
  const query = async event => {
    event.preventDefault();
    if (pending.current || !binding?.canQuery || !binding.serverReadingAvailable) return;
    pending.current=true;setBusy(true);setError(null);
    const ticket=scope.current.begin();
    try {
      const data=await send('POST',{connectionId:binding.connectionId, operation,
        ...(operation==='inhouse'?{}:{date})},ticket);
      if (!ticket.valid()) return;
      if (data.connectionId!==binding.connectionId || data.observation?.kind!=='partial_observation' ||
        data.observation.context?.operation!==operation || data.observation.context?.date!==(operation==='inhouse'?undefined:date)) {
        throw Object.assign(Error('safe'),{code:'STRUCTURE_INVALID'});
      }
      setResult(data);setBinding(data);
    } catch(e) {
      if(ticket.valid()){
        if([403,409].includes(e.status)){setResult(null);setBinding(null);}
        setError({message:messages[e.code] || messages.READ_FAILED,diagnosticId:e.diagnosticId});
      }
    } finally {if(ticket.valid()){pending.current=false;setBusy(false);}}
  };
  const change = (setter,value) => {setter(value);setResult(null);setError(null);};
  const observation=result?.observation;
  return <section className="min-w-0 space-y-4">
    <Link href="/dashboard/settings/pms" className="inline-block underline">{tx('Volver a Conexiones PMS')}</Link>
    <h1 className={cn('text-3xl font-semibold',ui.text.title(light))}>{tx('Datos de Ubikos')}</h1>
    {binding?<p className={ui.text.body(light)}>{binding.hotelName} · Ubikos · {binding.externalHotelId}</p>:null}
    <div className={ui.notice(light,'warning')}>
      {binding?.simulated?<strong>{tx('Laboratorio simulado · datos totalmente ficticios')}. </strong>:null}
      {tx('Lecturas del PMS, no importaciones. La cobertura completa sigue pendiente de confirmar.')}
      <p>{tx('No se crean huéspedes, conversaciones, tickets ni reservas operativas. No se activan envíos.')}</p>
    </div>
    {binding&&!binding.serverReadingAvailable?<p>{tx(messages.SERVER_READING_UNAVAILABLE)}</p>:null}
    {binding&&!binding.canQuery?<p>{tx('La consulta manual requiere permiso para gestionar conexiones PMS.')}</p>:null}
    <form onSubmit={query} className={cn('grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]',ui.card(light))}>
      <label className="min-w-0 space-y-1">{tx('Operación')}
        <select value={operation} disabled={busy} onChange={e=>change(setOperation,e.target.value)} className={cn('w-full',ui.input(light))}>
          <option value="checkin">{tx('Llegadas')}</option><option value="checkout">{tx('Salidas')}</option><option value="inhouse">{tx('Alojados')}</option>
        </select>
      </label>
      {operation!=='inhouse'?<label className="min-w-0 space-y-1">{tx('Fecha de consulta')}
        <input type="date" required value={date} disabled={busy} onChange={e=>change(setDate,e.target.value)} className={cn('min-w-0 w-full',ui.input(light))}/>
      </label>:<p className="text-sm">{tx('Observación del momento de consulta.')}</p>}
      <button disabled={busy||!binding?.canQuery||!binding?.serverReadingAvailable} className={ui.button(light,'primary')}>
        {tx(busy?'Consultando…':'Consultar manualmente')}
      </button>
    </form>
    {busy?<p role="status">{tx('Consultando…')}</p>:null}
    {error?<div role="alert" className={ui.notice(light,'danger')}>{tx(error.message)} {observation?tx('Se conserva la última lectura correcta; no está actualizada.'):null}
      {error.diagnosticId?<p className="break-all">{tx('Referencia de diagnóstico')}: {error.diagnosticId}</p>:null}</div>:null}
    {observation?<article className={cn('space-y-3',ui.card(light))}>
      <h2 className="text-xl font-semibold">{tx('Última lectura correcta')}</h2>
      <p>{new Date(observation.context.observedAt).toLocaleString(language)} · {tx('Filas recibidas')}: <strong>{observation.rowCount}</strong></p>
      <p className="text-sm">{tx('El recuento no indica reservas, personas ni habitaciones únicas. Los duplicados se conservan.')}</p>
      {!observation.records.length?<p>{tx('Lista vacía. No implica cancelaciones, salidas ni habitaciones libres.')}</p>:
        <div className="space-y-2" role="list" aria-label={tx('Filas recibidas')}>
          {observation.records.map(row=><div key={row.index} role="listitem" className={cn('grid gap-2 rounded-lg border p-3 sm:grid-cols-2',ui.surface(light,'subtle'))}>
            <p className="min-w-0 break-all"><span className="block text-sm">{tx('Identificador externo de reserva')}</span><strong>{row.externalBookingId??tx('Desconocido')}</strong></p>
            <p className="min-w-0 break-all"><span className="block text-sm">{tx('Referencia de habitación')}</span><strong className="whitespace-pre-wrap">{row.externalRoomReference??tx('Desconocida')}</strong></p>
          </div>)}
        </div>}
      {observation.issues.length?<details><summary className="cursor-pointer font-semibold">{tx('Incidencias de esta lectura')} ({observation.issues.length})</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">{observation.issues.map((issue,i)=><li key={i}>{tx('Fila')} {issue.index+1}: {tx(issueLabels[issue.code]||'Dato no interpretable.')}</li>)}</ul>
      </details>:null}
    </article>:!busy?<p>{tx('Todavía no hay una lectura correcta para esta selección.')}</p>:null}
  </section>;
}
