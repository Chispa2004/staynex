'use client';
import {Circle,PlayCircle,CheckCircle2,Loader2} from 'lucide-react';
import {useDashboardLanguage} from '@/lib/i18n/useDashboardLanguage';
import styles from './TicketStatus.module.css';

export const ticketStatusLabel = status => ({open:'Abierto',in_progress:'En curso',completed:'Hecho',pending:'Pendiente',closed:'Cerrado',cancelled:'Cancelado',resolved:'Resuelto'}[status] || status || 'Sin estado');
const actions=[['open',Circle],['in_progress',PlayCircle],['completed',CheckCircle2]];

export function TicketStatusBadge({status}) {
  const {tx}=useDashboardLanguage();
  return <span className={styles.badge} data-ticket-status={status}>{tx(ticketStatusLabel(status))}</span>;
}

export function TicketStatusActions({ticket,pending,error,onChange}) {
  const {tx}=useDashboardLanguage();
  return <div className={styles.wrapper} onClick={event=>event.stopPropagation()}>
    <div className={styles.actions} role="group" aria-label={tx('Estado del ticket')} aria-busy={Boolean(pending)}>
      {actions.map(([value,Icon])=>{
        const current=ticket.status===value, label=tx(ticketStatusLabel(value));
        return <button key={value} type="button" data-ticket-status={value} data-current={current}
          className={styles.action} disabled={current || Boolean(pending)}
          aria-label={current?`${label} · ${tx('Estado actual')}`:label}
          onClick={()=>onChange(value)}>
          <span className={styles.actionLabel}>{pending===value?<Loader2 className={styles.spinner} aria-hidden="true"/>:<Icon aria-hidden="true"/>}{label}</span>
          {current?<small>{tx('Estado actual')}</small>:null}
        </button>;
      })}
    </div>
    {pending?<p role="status" className={styles.notice}>{tx('Guardando estado…')}</p>:null}
    {error?<p role="alert" className={styles.error}>{tx(error)}</p>:null}
  </div>;
}
