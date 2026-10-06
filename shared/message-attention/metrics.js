import {CHECKIN_DEMO_HOTEL_ID} from '../checkin-demo-view.js';
import { ATTENTION_ORIGINS, attentionError, isAttentionId, isAttentionMessage } from './contract.js';

export const MESSAGE_METRICS = {
  received: 'Mensajes recibidos', resolved: 'Mensajes resueltos',
  pending: 'Mensajes pendientes', urgent: 'Mensajes urgentes'
};
export const METRIC_ORIGINS = { traced: 'Entradas trazables', simulated: 'SIMULADO', unknown: 'Origen no confirmado' };
export const metricDay = (at, timezone) => {
  try {
    if (!timezone) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date(at)).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch { return null; }
};
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function parseMessageMetric(params) {
  if (!params.has('metric')) return null;
  const metric = params.get('metric'), origin = params.get('metricOrigin'), hotelId = params.get('hotelId'), date = params.get('metricDate');
  const history=params.get('metricPeriod')==='history' && origin==='all' && hotelId===CHECKIN_DEMO_HOTEL_ID;
  if ((params.has('metricPeriod') && !history) || !Object.hasOwn(MESSAGE_METRICS,metric) || (!ATTENTION_ORIGINS.includes(origin) && !history) || !isAttentionId(hotelId)
    || ['metric','metricOrigin','hotelId','metricDate','metricPeriod'].some(k=>params.getAll(k).length>1)
    || (history ? date!==null : ['received','resolved'].includes(metric) ? !validDay(date) : date !== null)) throw attentionError('Filtro de mensajes no válido.',400);
  if (params.has('stage') && !['all','pre','stay','post','unknown'].includes(params.get('stage'))
    || params.has('origin') && !['all','simulated','other'].includes(params.get('origin'))
    || params.has('filter') && !['all','unread','human','urgent','vip','ai'].includes(params.get('filter'))
    || (params.get('q') || '').length>200
    || params.has('page') && !/^[1-9]\d{0,6}$/.test(params.get('page'))) throw attentionError('Filtro adicional no válido.',400);
  return {metric,origin,hotelId,date,...(history?{period:'history'}:{})};
}
export const metricMatchingIds = (conversation,metric,stage='all',origin='all') => {
  const ids=new Set(metric?.byConversation?.[conversation.id] || []);
  return (conversation.messages || []).filter(m=>ids.has(m.id) && (stage==='all' || (m.stayStage || 'unknown')===stage)
    && (origin==='all' || m.inboxOrigin===origin)).map(m=>m.id);
};
export function messageMetricHref({metric,origin,hotelId,date,period}) {
  const params = new URLSearchParams({metric,metricOrigin:origin,hotelId});
  if(period==='history')params.set('metricPeriod',period);
  else if (['received','resolved'].includes(metric)) params.set('metricDate',date);
  parseMessageMetric(params);
  return '/dashboard/inbox?'+params;
}
export function removeMessageMetric(href) {
  const url=new URL(href);
  for (const key of ['metric','metricOrigin','metricDate','metricPeriod','messageId','conversationId','q','stage','origin','filter','page']) url.searchParams.delete(key);
  return url.pathname+url.search;
}
// Mirrors the installed canonical SQL origin contract, not Inbox's broader "other" group.
export function attentionOrigin(message, claimedIds) {
  const m=message.metadata || {};
  if (m.demo===true || m.checkin_demo===true || m.simulation===true
    || (m.fixture!==null && m.fixture!==undefined && (typeof m.fixture==='object' ? JSON.stringify(m.fixture) : String(m.fixture))!=='')
    || /^(demo|mock|simulation|checkin_demo)([_-]|$)/i.test(m.source || '')) return 'simulated';
  return claimedIds.has(message.id) ? 'traced' : 'unknown';
}
// Shared by the four Dashboard counts and Inbox results. Attention snapshots come
// from the existing backend-only RPC, never a delivery/read/control inference.
export function buildMessageMetrics({hotelId,timezone,origin,period,messages,conversations,attention,alerts,claimedIds,now=new Date().toISOString(),date=metricDay(now,timezone)}) {
  const conversationIds=new Set(conversations.filter(c=>c.hotel_id===hotelId).map(c=>c.id));
  const result={received:[],resolved:[],pending:[],urgent:[]};
  let urgentKnown=true;
  const nowMs=Date.parse(now);
  for (const m of messages) {
    if (m.hotel_id!==hotelId || !conversationIds.has(m.conversation_id) || !isAttentionMessage(m) || (origin!=='all' && attentionOrigin(m,claimedIds)!==origin)) continue;
    const state=attention.get(m.id), alert=alerts.get(m.conversation_id);
    if (!state) throw attentionError('Seguimiento no disponible. Actualiza para reintentar.',503);
    const created=Date.parse(m.created_at), changed=Date.parse(state.changedAt);
    if (created<=nowMs && (period==='history' || date && metricDay(m.created_at,timezone)===date)) result.received.push(m);
    if (state.status==='resolved' && changed<=nowMs && (period==='history' || date && metricDay(state.changedAt,timezone)===date)) result.resolved.push(m);
    if (state.status==='pending') {
      if (alert && (alert.updated_at===null || Date.parse(alert.updated_at)>nowMs)) urgentKnown=false;
      if (created<=nowMs) {
        result.pending.push(m);
        if (alert?.escalation_level==='urgent' && Date.parse(alert.updated_at)>=created && Date.parse(alert.updated_at)<=nowMs) result.urgent.push(m);
      }
    }
  }
  if (period!=='history' && (!date || !metricDay(now,timezone))) result.received=result.resolved=null;
  if (!urgentKnown) result.urgent=null;
  return {hotelId,origin,date:period==='history'?null:date,...(period?{period}:{}),timezone,readAt:now,sets:result,counters:Object.fromEntries(Object.entries(result).map(([key,rows])=>[key,rows?.length ?? null]))};
}
export function selectMessageMetric(snapshot,filter) {
  if (snapshot.hotelId!==filter.hotelId || snapshot.origin!==filter.origin || snapshot.period!==filter.period) throw attentionError('El filtro pertenece a otro hotel.',403);
  const matches=snapshot.sets[filter.metric];
  if (!matches) throw attentionError('Fuente o periodo no disponible. No se confirma un resultado vacío.',503);
  const byConversation={};
  for (const m of matches) (byConversation[m.conversation_id] ||= []).push(m.id);
  return {...filter,timezone:snapshot.timezone,readAt:snapshot.readAt,messageCount:matches.length,conversationCount:Object.keys(byConversation).length,byConversation};
}
