'use client';
import {mergeTicketVersion} from '../../shared/attention-lifecycle.js';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {PriorityBadge} from './Badge';
import {TicketStatusBadge,TicketStatusActions} from './TicketStatus';
import {TicketAgeLabel} from './TicketAgeLabel';
import {TicketCategoryIcon} from './TicketCategoryIcon';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
import {useTicketStatusMutation} from '@/lib/useTicketStatusMutation';
import styles from './TicketsTable.module.css';
const sortByNewest=items=>[...items].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
const formatDate=value=>value?new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Sin fecha';
const categoryLabels = {
  maintenance: 'Mantenimiento',
  emergency: 'Emergencia',
  housekeeping: 'Pisos',
  room_service: 'Servicio de habitaciones',
  hotel_info: 'Información del hotel',
  transport: 'Transporte',
  reception: 'Recepción',
  complaint: 'Incidencia huésped',
  guest_request: 'Solicitud huésped'
};

const formatText = (value, fallback, labels = {}) => {
  if (!value) {
    return fallback;
  }

  const normalized = String(value).trim();
  const key = normalized.toLowerCase();
  return labels[key] || labels[normalized] || normalized.replaceAll('_', ' ');
};

const getTicketPrimaryText = (ticket = {}) => (
  String(ticket.title || ticket.subject || ticket.short_description || ticket.description || '').trim()
  || 'Ticket sin título'
);

const getTicketSecondaryText = (ticket = {}) => {
  const description = String(ticket.description || '').trim();
  const primary = getTicketPrimaryText(ticket);
  return description && description !== primary ? description : null;
};

const isUrgentTicket = (ticket) => ticket.priority === 'urgent' || ticket.category === 'emergency';

const getTicketRowClass = (ticket) => {
  if (isUrgentTicket(ticket)) {
    return 'border-l-2 border-red-400 bg-red-500/[0.045] shadow-[inset_14px_0_28px_-24px_rgba(248,113,113,0.95)] hover:bg-red-500/[0.085]';
  }

  if (ticket.priority === 'high') {
    return 'border-l-2 border-orange-300 bg-orange-500/[0.035] hover:bg-orange-500/[0.075]';
  }

  return 'border-l-2 border-transparent hover:bg-white/[0.035]';
};


export const TicketsTable=({tickets,compact=false,hotelId=null,onUpdated=null})=>{
  const router=useRouter(),{t,tx}=useDashboardLanguage();
  const [items,setItems]=useState(()=>sortByNewest(tickets));
  useEffect(()=>{setItems(current=>sortByNewest(tickets.map(next=>{const previous=current.find(item=>item.id===next.id && item.hotel_id===next.hotel_id);return previous?mergeTicketVersion(previous,next):next;})));},[tickets]);
  const mutation=useTicketStatusMutation({hotelId,onConfirmed:ticket=>{
    setItems(current=>current.map(item=>item.id===ticket.id?mergeTicketVersion(item,ticket):item));
    onUpdated?.();
  }});
  const href=ticket=>`/dashboard/tickets/${ticket.id}${hotelId?`?hotelId=${encodeURIComponent(hotelId)}`:''}`;
  const problem=ticket=><><p className={styles.title}><Link href={href(ticket)} onClick={e=>e.stopPropagation()}>{getTicketPrimaryText(ticket)}</Link></p><p className={styles.room}>{ticket.room_number?tx('Habitación {room}',{room:ticket.room_number}):t('tickets.noRoom')}</p>{getTicketSecondaryText(ticket)?<p className={styles.description}>{getTicketSecondaryText(ticket)}</p>:null}</>;
  const actions=ticket=><TicketStatusActions ticket={ticket} pending={mutation.pending[ticket.id]} error={mutation.errors[ticket.id]} onChange={status=>mutation.change(ticket,status)}/>;
  if(!items.length)return <div className={styles.empty}><p>{t('tickets.noTickets')}</p><p>{t('tickets.noTicketsDescription')}</p></div>;
  return <div className={styles.list} data-compact={compact}>
    <p className={styles.count}>{t('tickets.count',{count:items.length})}</p>
    <div className={styles.mobile}>
      {items.map(ticket=><article key={ticket.id} className={styles.card} onClick={()=>router.push(href(ticket))}>
        {problem(ticket)}
        <div className={styles.meta}><TicketCategoryIcon category={ticket.category}/><span>{tx(formatText(ticket.category,t('tickets.noData'),categoryLabels))}</span><PriorityBadge priority={ticket.priority}/><TicketStatusBadge status={ticket.status}/>{ticket.demoProvenance==='review'?<span>{tx('Procedencia por revisar')}</span>:null}</div>
        <div className={styles.date}><span>{formatDate(ticket.created_at)}</span><TicketAgeLabel createdAt={ticket.created_at} urgent={isUrgentTicket(ticket)}/></div>
        {actions(ticket)}
      </article>)}
    </div>
    <div className={styles.desktop} role="region" aria-label={t('screens.tickets')}>
      <table className={styles.table}>
        <colgroup><col style={{width:'32%'}}/><col style={{width:'12%'}}/><col style={{width:'9%'}}/><col style={{width:'10%'}}/><col style={{width:'14%'}}/><col style={{width:'23%'}}/></colgroup>
        <thead><tr>{[tx('Problema'),t('table.category'),t('table.priority'),t('table.status'),t('table.date'),t('table.quickActions')].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{items.map(ticket=><tr key={ticket.id} onClick={()=>router.push(href(ticket))} className={getTicketRowClass(ticket)}>
          <td>{problem(ticket)}</td>
          <td><div className={styles.category}><TicketCategoryIcon category={ticket.category}/><span>{tx(formatText(ticket.category,t('tickets.noData'),categoryLabels))}</span></div></td>
          <td><PriorityBadge priority={ticket.priority}/></td>
          <td><TicketStatusBadge status={ticket.status}/>{ticket.demoProvenance==='review'?<span>{tx('Procedencia por revisar')}</span>:null}</td>
          <td><div className={styles.date}><span>{formatDate(ticket.created_at)}</span><TicketAgeLabel createdAt={ticket.created_at} urgent={isUrgentTicket(ticket)}/></div></td>
          <td>{actions(ticket)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
};
