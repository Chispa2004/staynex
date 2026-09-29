'use client';

import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { pmsActions, pmsEvidence, pmsResultLabel } from '@/lib/pms-evidence';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

export const PmsProviderCard = ({provider,connection,receipt,onEdit,onTest,onSync,onDisconnect,busyAction,canManage=false,permissionDenied=false,held=false}) => {
  const {tx,language}=useDashboardLanguage();const {theme}=useDashboardTheme();const light=theme==='light';
  const evidence=pmsEvidence(provider,connection,receipt),actions=pmsActions(provider,connection,canManage&&!busyAction);
  const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString(language):tx('Fecha no disponible');
  return <ExecutiveCard className="min-w-0 p-5" >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h3 className={cn('text-lg font-semibold',ui.text.title(light))}>{provider.name}</h3>
      <ExecutiveBadge tone="slate">{tx(evidence.configuration)}</ExecutiveBadge>
    </div>
    <p className={cn('mt-2',ui.text.muted(light))}>{tx(evidence.environment)}</p>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      {[[tx('Última prueba'),evidence.test],[tx('Última sincronización'),evidence.sync]].map(([label,result])=><div key={label} className={cn('min-w-0 rounded-lg border p-3',ui.surface(light,'subtle'))}>
        <dt className={ui.text.eyebrow(light)}>{label}</dt>
        <dd className={cn('mt-2 text-sm font-semibold',ui.text.title(light))}>{tx(pmsResultLabel(result.status))}</dd>
        <dd className={cn('mt-1 text-xs',ui.text.muted(light))}>{result.at?`${tx(result.previous?'Último registro anterior':result.receipt?'Respuesta recibida':'Registro guardado')}: ${date(result.at)}`:tx('Fecha no disponible')}</dd>
        {result.receipt?<dd className={cn('mt-1 text-xs',ui.text.muted(light))}>{tx('Resultado de esta sesión; no sustituye el historial persistido.')}</dd>:null}
      </div>)}
    </dl>
    {evidence.legacyTest?<p className={cn('mt-3',ui.text.muted(light))}>{tx('Existe un estado de prueba anterior sin fecha independiente. No acredita conectividad actual.')}</p>:null}
    {connection?.last_sync_error?<p role="status" className="mt-3 text-sm text-red-600">{tx('El registro guardado contiene un error de sincronización. Revisa la configuración antes de reintentar.')}</p>:null}
    {connection?.last_webhook_at?<p className={cn('mt-3',ui.text.muted(light))}>{tx('Último webhook registrado')}: {date(connection.last_webhook_at)}</p>:null}
    {evidence.external?<p className={cn('mt-3',ui.text.body(light))}>{tx('Puedes guardar la configuración. Staynex y el proveedor deben completar la integración externa; aquí no hay prueba ni sincronización real implementada.')}</p>:null}
    {held?<p role="status" className={cn('mt-3',ui.text.body(light))}>{tx('La actividad permanece suspendida tras el archivo. Se requiere revisión administrativa independiente.')}</p>:null}
    {permissionDenied&&!held?<p className={cn('mt-3',ui.text.muted(light))}>{tx('Solo un administrador autorizado puede modificar PMS. Recepción y soporte de solo lectura no pueden hacerlo.')}</p>:null}
    {provider.key==='apaleo'&&connection?.webhook_url?<label className="mt-3 block text-sm">{tx('URL del webhook')}<input readOnly aria-label={tx('URL del webhook')} value={connection.webhook_url} className={cn('mt-1 block w-full min-w-0 rounded border p-2 text-xs',ui.surface(light,'subtle'))}/></label>:null}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={!actions.configure} onClick={()=>onEdit(provider,connection)} className={ui.button(light,'secondary')}>{tx(connection?'Gestionar configuración':'Configurar')} {provider.name}</button>
      {!evidence.external?<>
        <button type="button" disabled={!actions.test} onClick={()=>onTest(provider,connection)} className={ui.button(light,'secondary')}>{tx(busyAction?.action==='test'&&busyAction.provider===provider.key?'Probando…':'Probar conexión')} {provider.name}</button>
        <button type="button" disabled={!actions.sync} onClick={()=>onSync(provider,connection)} className={ui.button(light,'secondary')}>{tx(busyAction?.action==='sync'&&busyAction.provider===provider.key?'Sincronizando…':'Sincronizar reservas')} {provider.name}</button>
      </>:null}
      {connection?<button type="button" disabled={!actions.configure} onClick={()=>onDisconnect(provider,connection)} className={ui.button(light,'secondary')}>{tx('Deshabilitar configuración')} {provider.name}</button>:null}
    </div>
  </ExecutiveCard>;
};
