'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuthHeaders } from './auth-headers';
import { shouldAcceptTenantPayload } from './tenant-client';
import { WORKSPACE_SELECTION_EVENT, WORKSPACE_ARCHIVED_EVENT } from './workspace-context';
import { getSupabaseBrowser } from './supabase-browser';
import { operationalHref } from '../../shared/operational-metrics.js';

export const sameOperationalRequest = (request, current, headers, nextHeaders) => request === current && JSON.stringify(headers) === JSON.stringify(nextHeaders);
export const useOperationalMetrics = (kind) => {
  const router = useRouter(), params = useSearchParams(), key = params.toString();
  const [state,setState] = useState({key:null,data:null,loading:true,error:null});
  const generation = useRef(0), keyRef = useRef(key);
  keyRef.current = key;
  const load = useCallback(async (options = {}) => {
    const request = ++generation.current;
    let retainData=Boolean(options.preserve);
    setState(previous=>options.preserve && previous.key===key && previous.data ? {...previous,loading:false,refreshing:true,error:null} : {key,data:null,loading:true,error:null});
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/${kind}?view=metrics&${key}`,{headers,cache:'no-store'});
      const payload = await response.json();
      const nextHeaders = await getAuthHeaders();
      if (!sameOperationalRequest(request,generation.current,headers,nextHeaders) || keyRef.current !== key) return;
      if (!response.ok) { if ([401,403].includes(response.status)) retainData=false; throw new Error(payload.error || 'No se pudieron confirmar los resultados.'); }
      if (!shouldAcceptTenantPayload(payload,kind) || !payload.hotelId || !payload.metrics || !Array.isArray(payload[kind])) { retainData=false; throw new Error('El contexto cambió. Actualiza para reintentar.'); }
      setState({key,data:payload,loading:false,error:null});
    } catch(error) {
      if (request === generation.current && keyRef.current === key) setState(previous=>({key,data:retainData && previous.key===key?previous.data:null,loading:false,error:error.message}));
    }
  },[kind,key]);
  useEffect(()=>{load();return()=>{generation.current++;};},[load]);
  useEffect(()=>{
    const invalidate=()=>{generation.current++;setState({key:null,data:null,loading:true,error:null});load();};
    window.addEventListener(WORKSPACE_SELECTION_EVENT,invalidate);
    window.addEventListener(WORKSPACE_ARCHIVED_EVENT,invalidate);
    const {data} = getSupabaseBrowser()?.auth.onAuthStateChange((event)=>{
      if (['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event)) invalidate();
    }) || {};
    return()=>{window.removeEventListener(WORKSPACE_SELECTION_EVENT,invalidate);window.removeEventListener(WORKSPACE_ARCHIVED_EVENT,invalidate);data?.subscription?.unsubscribe();};
  },[load]);
  const visible = state.key === key ? state : {data:null,loading:true,error:null};
  const canonical = new URLSearchParams(key);
  if (visible.data) {
    canonical.set('hotelId',visible.data.hotelId);
    if (visible.data.metrics.filter.date) canonical.set('date',visible.data.metrics.filter.date);
  }
  const href = changes => operationalHref(kind,canonical.toString(),changes);
  const change = changes => router.push(href(changes),{scroll:false});
  return {...visible,load,href,change,params};
};
