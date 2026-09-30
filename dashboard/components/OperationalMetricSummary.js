'use client';
import Link from 'next/link';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
export const operationalLabels = {
  urgent_risk:'Riesgo urgente', satisfaction_risk:'Satisfacción en riesgo', ai_prioritized:'Priorizados por IA',
  total:'Reservas totales',arrivingSoon:'Llegadas en 7 días',stayingNow:'Alojados ahora',completed:'Estancias completadas',
  all:'Todos',upcoming:'Próximas',in_house:'Alojados ahora',cancelled:'Canceladas',today_arrivals:'Llegadas hoy',today_departures:'Salidas hoy'
};
export const OperationalMetricSummary = ({metrics,kind,href,loading,error}) => {
  const {tx:t}=useDashboardLanguage(),{theme}=useDashboardTheme();
  if (loading || error || !metrics) return <p role="status">{t(loading?'Consultando registros…':'Resultados no confirmados')}</p>;
  const {filter,total,metricTotal,timezone}=metrics;
  return <section aria-label={t('Filtro operativo')} className={`rounded-lg border p-4 text-sm ${theme==='light'?'border-emerald-200 bg-emerald-50 text-slate-800':'border-emerald-300/20 bg-emerald-300/10 text-slate-100'}`}>
    <p className="font-semibold">{t('Filtro operativo')}: {t(operationalLabels[filter.metric])}</p>
    <p>{kind==='tickets'?t('Estado actual · todos los estados del ticket'): `${filter.date} · ${timezone}`}</p>
    {filter.metric==='arrivingSoon'?<p>{t('Desde la fecha indicada hasta siete días después, ambos inclusive.')}</p>:null}
    <p role="status">{t(kind==='tickets'?'{count} tickets':'{count} reservas',{count:total})}</p>
    {total!==metricTotal?<p>{t('Antes de los filtros adicionales: {count}',{count:metricTotal})}</p>:null}
    {filter.q?<p>{t('Búsqueda')}: {filter.q}</p>:null}
    {!total?<p>{t('No hay registros que cumplan estos filtros.')}</p>:null}
    <p>{t('El resultado se actualiza al consultar; puede cambiar respecto a la tarjeta.')}</p>
    <Link href={href({metric:'all',q:null,status:null,priority:null,category:null})} className="inline-block mt-2 underline rounded focus-visible:ring-2 focus-visible:ring-emerald-500">{t('Retirar filtros')}</Link>
  </section>;
};
export const OperationalPagination=({metrics,href})=>{
  const {tx:t}=useDashboardLanguage();
  if(!metrics)return null;
  const pages=Math.max(1,Math.ceil(metrics.total/metrics.pageSize));
  return <nav aria-label={t('Páginas de resultados')} className="flex flex-wrap items-center gap-4 text-sm">
    {metrics.page>1?<Link className="underline focus-visible:ring-2" href={href({page:metrics.page-1})}>{t('Anterior')}</Link>:null}
    <span>{t('Página {page} de {pages}',{page:metrics.page,pages})}</span>
    {metrics.page<pages?<Link className="underline focus-visible:ring-2" href={href({page:metrics.page+1})}>{t('Siguiente')}</Link>:null}
  </nav>;
};
