'use client';
import Link from 'next/link';
import { MESSAGE_METRICS, METRIC_ORIGINS, removeMessageMetric } from '../../shared/message-attention/metrics.js';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

export function InboxMetricSummary({active,state,visibleConversations,visibleMessages,onRetry}) {
  const {tx}=useDashboardLanguage();
  if (!active) return null;
  const metric=state?.data;
  return <section aria-label={tx('Filtro del Dashboard')} className="my-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-slate-800">
    <p className="font-semibold">{tx('Filtro del Dashboard')}{metric ? ': '+tx(MESSAGE_METRICS[metric.metric]) : ''}</p>
    {state?.status==='ready' && metric ? <>
      <p>{tx(METRIC_ORIGINS[metric.origin])} · {metric.date || tx('Estado actual')} · {metric.timezone || tx('Zona horaria no disponible')}</p>
      <p role="status">{tx('{messages} mensajes en {conversations} conversaciones',{messages:metric.messageCount,conversations:metric.conversationCount})}</p>
      {visibleConversations!==undefined && (visibleConversations!==metric.conversationCount || visibleMessages!==metric.messageCount) ? <p>{tx('Con los filtros adicionales: {messages} mensajes en {conversations} conversaciones',{messages:visibleMessages,conversations:visibleConversations})}</p> : null}
      <p>{tx(metric.messageCount===0 ? 'No hay mensajes que cumplan este criterio.' : 'Los mensajes coincidentes están señalados dentro del contexto completo.')}</p>
      <p>{tx('Resultado actualizado al abrir o refrescar; puede cambiar respecto al Dashboard.')}</p>
    </> : <p role={state?.status==='error'?'alert':'status'}>{tx(state?.error || 'Consultando el conjunto de mensajes…')}</p>}
    <div className="mt-2 flex flex-wrap gap-3">
      <button type="button" className="underline focus-visible:outline focus-visible:outline-2" onClick={()=>window.history.pushState(null,'',removeMessageMetric(document.URL))}>{tx('Retirar filtro del Dashboard')}</button>
      <Link className="underline focus-visible:outline focus-visible:outline-2" href={'/dashboard'+(metric?.hotelId?'?hotelId='+encodeURIComponent(metric.hotelId)+'&attentionOrigin='+encodeURIComponent(metric.origin):'')}>{tx('Volver al Dashboard')}</Link>
      {state?.status==='error' ? <button type="button" className="underline" onClick={onRetry}>{tx('Reintentar')}</button> : null}
    </div>
  </section>;
}
