// A receipt is the only automatic association between a message and a request.
export function attentionSelection(ids, rows, groups, target) {
  const selected=new Set(ids);
  let changed=true;
  while(changed) {
    changed=false;
    for(const group of groups) if(group.messageIds.some(id=>selected.has(id))) {
      if(target==='resolved' && group.status!=='completed')
        throw new Error('Primero completa la actuación del ticket: '+group.title+'. Después revisa la comunicación al huésped.');
      for(const id of group.messageIds) {
        const row=rows.get(id);
        if(!row) throw new Error('Faltan mensajes de esta petición. Actualiza la conversación antes de continuar.');
        if(row.status!==target && !selected.has(id)){selected.add(id);changed=true;}
      }
    }
  }
  if(selected.size>50)throw new Error('Esta petición supera 50 mensajes. No se ha cambiado ningún estado; necesita revisión.');
  return [...selected];
}
export function mergeTicketVersion(current,next) {
  if(!next || current.id!==next.id || current.hotel_id!==next.hotel_id
    || !Number.isSafeInteger(next.status_version) || next.status_version<(current.status_version||0)) return current;
  return {...current,...next};
}
export function validTicketOperation(body) {
  return body && ['open','in_progress','completed'].includes(body.status)
    && typeof body.expectedStatus==='string' && Number.isSafeInteger(body.expectedVersion) && body.expectedVersion>0
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId||'');
}
