'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {getAuthHeaders} from './auth-headers';
import {getActiveTenantId,shouldAcceptTenantPayload} from './tenant-client';
import {WORKSPACE_SELECTION_EVENT,WORKSPACE_ARCHIVED_EVENT} from './workspace-context';
import {getSupabaseBrowser} from './supabase-browser';

export function usePendingTickets(origin,hotelKey,refreshVersion) {
  const key=hotelKey+':'+origin;
  const [state,setState]=useState({key:null,data:null,error:null,loading:true});
  const generation=useRef(0),currentKey=useRef(key),controller=useRef(null);
  currentKey.current=key;
  const load=useCallback(async()=>{
    const request=++generation.current;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const timer=setTimeout(()=>abort.abort(),15000);
    setState(old=>({...old,key, data:old.key===key?old.data:null,error:null,loading:true}));
    try {
      const headers=await getAuthHeaders();
      const scope=getActiveTenantId();
      const response=await fetch('/api/tickets?'+new URLSearchParams({view:'pending',ticketOrigin:origin}),{headers,cache:'no-store',signal:abort.signal});
      const body=await response.json();
      if(request!==generation.current || key!==currentKey.current || scope!==getActiveTenantId() || JSON.stringify(headers)!==JSON.stringify(await getAuthHeaders())) return;
      if(!response.ok) throw Object.assign(new Error('No se pudieron actualizar los tickets.'),{denied:[401,403].includes(response.status)});
      if(!body.hotelId || !shouldAcceptTenantPayload(body,'dashboard-tickets') || body.origin!==origin || !Array.isArray(body.tickets) || body.tickets.length>5 || !Number.isSafeInteger(body.total) || body.total<body.tickets.length)
        throw Object.assign(new Error('El contexto cambió. Actualiza para reintentar.'),{denied:true});
      setState({key,data:body,error:null,loading:false});
    } catch(error) {
      if(request===generation.current && key===currentKey.current) setState(old=>({key,data:!error.denied && old.key===key?old.data:null,error:error.message,loading:false}));
    } finally {clearTimeout(timer);}
  },[key,origin]);
  useEffect(()=>{load();return()=>{generation.current++;controller.current?.abort();};},[load,refreshVersion]);
  useEffect(()=>{
    const invalidate=()=>{generation.current++;controller.current?.abort();setState({key:null,data:null,error:null,loading:true});load();};
    const refresh=()=>{if(document.visibilityState!=='hidden')load();};
    const interval=setInterval(refresh,15000);
    window.addEventListener('focus',refresh);
    window.addEventListener(WORKSPACE_SELECTION_EVENT,invalidate);window.addEventListener(WORKSPACE_ARCHIVED_EVENT,invalidate);
    const {data}=getSupabaseBrowser()?.auth.onAuthStateChange(event=>{if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event))invalidate();})||{};
    return()=>{clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener(WORKSPACE_SELECTION_EVENT,invalidate);window.removeEventListener(WORKSPACE_ARCHIVED_EVENT,invalidate);data?.subscription?.unsubscribe();};
  },[load]);
  return {...(state.key===key?state:{data:null,error:null,loading:true}),load};
}
