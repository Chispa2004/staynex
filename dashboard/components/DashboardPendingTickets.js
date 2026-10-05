'use client';
import Link from 'next/link';
import {TicketStatusBadge} from './TicketStatus';
import {useSearchParams} from 'next/navigation';
import {TicketCheck,RefreshCw,ChevronRight} from 'lucide-react';
import {usePendingTickets} from '@/lib/usePendingTickets';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
import {dashboardTicketContext} from '../../shared/pending-tickets.js';
import styles from './HotelOperations.module.css';

const priorities={urgent:'Urgente',high:'Alta',normal:'Normal',low:'Baja'};
export function DashboardPendingTickets({refreshVersion=0}) {
  const params=useSearchParams(),{tx,language}=useDashboardLanguage();
  const origin=params.get('ticketOrigin')==='simulated'?'simulated':'other';
  const {data,error,loading,load}=usePendingTickets(origin,params.get('hotelId')||'',refreshVersion);
  const changeOrigin=value=>{const url=new URL(document.URL);url.searchParams.set('ticketOrigin',value);window.history.pushState(null,'',url.pathname+url.search);};
  const context=data?dashboardTicketContext(params,data.hotelId):null;
  context?.set('ticketOrigin',origin);
  const date=value=>{try{return new Intl.DateTimeFormat(language,{timeZone:data.timezone||'Europe/Madrid',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return tx('Fecha no disponible');}};
  return <section className={styles.panel} aria-label={tx('Tickets pendientes')}>
    <div className={styles.panelHeader}>
      <div><h2 className={styles.panelTitle}><TicketCheck aria-hidden="true"/>{tx('Tickets pendientes')}</h2><p className={styles.subtitle}>{tx('Abiertos, pendientes y en curso')}</p></div>
      <button type="button" onClick={load} className={styles.link} aria-label={tx('Actualizar tickets')} disabled={loading}><RefreshCw className={loading?'h-4 w-4 animate-spin':'h-4 w-4'} aria-hidden="true"/></button>
    </div>
    <div className={styles.ticketTools}>
      <label>{tx('Origen de los tickets')} <select value={origin} onChange={e=>changeOrigin(e.target.value)}><option value="other">{tx('Sin marca de simulación')}</option><option value="simulated">{tx('SIMULADO')}</option></select></label>
      {data?<span>{tx('{count} pendientes',{count:data.total})}</span>:null}
    </div>
    {error?<div className={styles.ticketNotice} role="alert"><p>{tx(data?'No se pudieron actualizar los tickets. Se muestran datos anteriores.':'No se pudieron cargar los tickets.')}</p><button type="button" className={styles.link} onClick={load}>{tx('Reintentar tickets')}</button></div>:null}
    {loading?<p role="status" className={styles.coverage}>{tx(data?'Actualizando tickets…':'Cargando tickets…')}</p>:null}
    {data?.tickets.length?<ul className={styles.ticketList}>{data.tickets.map(ticket=><li key={ticket.id}>
      <Link className={styles.ticketRow} href={'/dashboard/tickets/'+encodeURIComponent(ticket.id)+'?'+context}>
        <div className={styles.ticketTop}><span className={styles.guestName}>{ticket.title || tx('Solicitud sin título')}</span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true"/></div>
        <p className={styles.subtitle}>{ticket.room_number?tx('Habitación {room}',{room:ticket.room_number}):tx('Habitación no indicada')}{ticket.guest_name?' · '+ticket.guest_name:''}</p>
        <div className={styles.ticketMeta}>
          <span className={styles.badge} data-tone={ticket.effectivePriority==='urgent'?'red':ticket.effectivePriority==='high'?'amber':'slate'}>{tx(priorities[ticket.effectivePriority]||'Normal')}</span>
          <TicketStatusBadge status={ticket.status}/>
          {ticket.isNew?<span className={styles.badge} data-tone="sky" title={tx('Creado en las últimas 24 horas; no indica lectura.')}>{tx('Nuevo')}</span>:null}
          {origin==='simulated'?<span className={styles.time}>{tx('SIMULADO')}</span>:null}
          <time className={styles.time} dateTime={ticket.created_at}>{date(ticket.created_at)}</time>
        </div>
      </Link>
    </li>)}</ul>:data && !loading && !error?<p className={styles.ticketNotice}>{tx('No hay tickets pendientes en este origen.')}</p>:null}
    {data?<div className={styles.ticketFooter}><Link className={styles.link} href={'/dashboard/tickets?'+context+'&metric=pending'}>{tx('Ver todos los pendientes')}<ChevronRight className="h-4 w-4" aria-hidden="true"/></Link></div>:null}
  </section>;
}
