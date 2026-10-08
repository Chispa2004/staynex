'use client';
import {useEffect,useRef,useState} from 'react';
import {getAuthHeaders} from './auth-headers';

export function useTicketStatusMutation({hotelId,onConfirmed}) {
  const [pending,setPending]=useState({}),[errors,setErrors]=useState({});
  const operations=useRef(new Map());
  const requests=useRef(new Map()),scope=useRef(hotelId),confirmed=useRef(onConfirmed);
  scope.current=hotelId; confirmed.current=onConfirmed;
  useEffect(()=>()=>{for(const controller of requests.current.values())controller.abort();requests.current.clear();},[hotelId]);
  const change=async(ticket,status)=>{
    if(requests.current.has(ticket.id) || ticket.status===status)return;
    const previous=operations.current.get(ticket.id);
    const operation=previous && previous.status===status && previous.expectedVersion===ticket.status_version && previous.hotelId===hotelId
      ? previous : {status,expectedStatus:ticket.status,expectedVersion:ticket.status_version,operationId:crypto.randomUUID(),hotelId};
    operations.current.set(ticket.id,operation);
    const controller=new AbortController(),requestHotel=hotelId;
    requests.current.set(ticket.id,controller);
    setPending(current=>({...current,[ticket.id]:status}));
    setErrors(current=>({...current,[ticket.id]:null}));
    try {
      const headers=await getAuthHeaders({hotelId:requestHotel});
      const response=await fetch(`/api/tickets/${ticket.id}/status`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(operation),signal:controller.signal});
      const body=await response.json();
      const currentHeaders=await getAuthHeaders({hotelId:requestHotel});
      if(controller.signal.aborted || scope.current!==requestHotel || JSON.stringify(headers)!==JSON.stringify(currentHeaders))return;
      if(response.status===409){operations.current.delete(ticket.id);throw new Error('El ticket cambió. Actualiza antes de reintentar.');}
      if(!response.ok)throw new Error(response.status===403?'No tienes permiso para cambiar este ticket.':'No se pudo confirmar el cambio. Se conserva el último estado confirmado; puedes reintentar.');
      if(body.ticket?.id!==ticket.id || body.ticket?.hotel_id!==requestHotel || body.ticket?.status!==status || !Number.isSafeInteger(body.ticket?.status_version) || body.ticket.status_version<=ticket.status_version)
        throw new Error('No se pudo confirmar el cambio. Se conserva el último estado confirmado; puedes reintentar.');
      operations.current.delete(ticket.id);
      confirmed.current(body.ticket);
    } catch(error) {
      if(!controller.signal.aborted && scope.current===requestHotel)setErrors(current=>({...current,[ticket.id]:['No tienes permiso para cambiar este ticket.','El ticket cambió. Actualiza antes de reintentar.'].includes(error.message)?error.message:'No se pudo confirmar el cambio. Se conserva el último estado confirmado; puedes reintentar.'}));
    } finally {
      if(requests.current.get(ticket.id)===controller){requests.current.delete(ticket.id);setPending(current=>{const next={...current};delete next[ticket.id];return next;});}
    }
  };
  return {pending,errors,change};
}
