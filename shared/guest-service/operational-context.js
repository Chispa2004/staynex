// Operational facts only; no personal memory and no identifiers from guest prose.
export function resolveOperationalContext({hotel,guest,conversation,reservations=[],stayContexts=[],sourceMessage=null,referenceTime=new Date().toISOString()}) {
  const empty={hotel_id:hotel?.id||null,conversation_id:conversation?.id||null,guest_id:guest?.id||null,
    reservation:null,known_room:null,historical_room:null,phase:'unknown',room_source:null,ambiguous:false};
  if(!hotel?.id || guest?.hotel_id!==hotel.id || conversation?.hotel_id!==hotel.id || conversation?.guest_id!==guest.id)return {...empty,reason:'invalid_scope'};
  if(sourceMessage && (sourceMessage.hotel_id!==hotel.id || sourceMessage.conversation_id!==conversation.id))return {...empty,reason:'invalid_message_scope'};
  const instant=new Date(sourceMessage?.created_at || referenceTime);
  if(!Number.isFinite(instant.getTime()))return {...empty,reason:'invalid_reference_time'};
  let day;try{day=new Intl.DateTimeFormat('en-CA',{timeZone:hotel.timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(instant);}catch{return {...empty,reason:'invalid_timezone'};}
  const candidates=reservations.filter(r=>r.hotel_id===hotel.id && r.guest_id===guest.id && !['cancelled','canceled','no_show'].includes(r.status));
  // Only a server-owned conversation relationship may bind a stay. Guest text
  // and inbound message metadata cannot select a reservation.
  const explicit=conversation.reservation_id;
  const scoped=explicit ? candidates.filter(r=>r.id===explicit) : candidates.filter(r=>r.arrival_date<=day && r.departure_date>=day);
  // More than one matching stay is ambiguous; never pick the latest arbitrarily.
  const reservation=scoped.length===1 ? scoped[0] : scoped.length===0 && !explicit && candidates.length===1 ? candidates[0] : null;
  if(!reservation)return {...empty,ambiguous:scoped.length>1 || candidates.length>1,reason:'stay_unconfirmed',reference_time:instant.toISOString()};
  const phase=day<reservation.arrival_date?'pre':day>reservation.departure_date?'post':'stay';
  const stays=stayContexts.filter(s=>s.hotel_id===hotel.id && s.guest_id===guest.id && s.reservation_id===reservation.id
    && s.room_number && s.last_updated_at && Date.parse(s.last_updated_at)<=instant.getTime());
  stays.sort((a,b)=>Date.parse(b.last_updated_at)-Date.parse(a.last_updated_at));
  const snapshot=stays[0];
  const snapshotNewer=snapshot && (!reservation.updated_at || Date.parse(snapshot.last_updated_at)>=Date.parse(reservation.updated_at));
  const reservationAfterMessage=reservation.updated_at && Date.parse(reservation.updated_at)>instant.getTime();
  const room=snapshotNewer || reservationAfterMessage && snapshot ? snapshot.room_number : !reservationAfterMessage ? reservation.room_number : null;
  const contradictory=room && guest.current_room && room!==guest.current_room && !snapshotNewer;
  const result={...empty,reservation,phase,reference_time:instant.toISOString(),ambiguous:Boolean(contradictory),
    historical_room:phase==='post'?room||null:null};
  if(phase!=='stay')return {...result,reason:'room_not_current_for_request'};
  if(contradictory)return {...result,reason:'room_conflict'};
  if(reservation.room_number && reservationAfterMessage && !snapshot)return {...result,reason:'room_history_unconfirmed'};
  const nowDay=new Intl.DateTimeFormat('en-CA',{timeZone:hotel.timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(referenceTime));
  const currentStays=candidates.filter(r=>r.arrival_date<=nowDay && r.departure_date>=nowDay);
  const legacyRoom=candidates.length===1 || currentStays.length===1 && currentStays[0].id===reservation.id ? guest.current_room : null;
  // A bare current_room without a dated stay is never accepted. Within one
  // authorized stay it is the legacy operational assignment when PMS lacks room.
  return {...result,known_room:room||legacyRoom||null,
    room_source:room?(snapshot && room===snapshot.room_number?'stay_snapshot':'reservation'):legacyRoom?'guest_assignment_in_stay':null,
    reason:room||legacyRoom?'confirmed':'room_missing'};
}
