import {normalizeServiceText,serviceTurn} from './ticket-context.js';

// These alternatives describe the missing evidence for the current question.
// They do not supply an amenity, location, time or permission from its name.
export function unconfirmedInformationReply(evidence,message,language='es') {
  const en=language.startsWith('en');
  if(!['es','en'].includes(language.slice(0,2)))return null;
  const text=normalizeServiceText(message);
  const topic=(en?{breakfast:'breakfast',reception:'reception',luggage:'luggage storage',cot:'cots',checkout:'check-out',checkin:'check-in',pool:'the pool',gym:'the gym',wifi:'Wi-Fi'}
    :{breakfast:'el desayuno',reception:'recepción',luggage:'la consigna',cot:'las cunas',checkout:'la salida',checkin:'la entrada',pool:'la piscina',gym:'el gimnasio',wifi:'el wifi'})[evidence.topic];
  if(!topic)return null;
  if(/vigente|actualizad|current|up.to.date/.test(text))return en
    ?`We don’t have verified current information about ${topic}.`:`No tenemos información actualizada y confirmada sobre ${topic}.`;
  if(/reserv|booking/.test(text))return en
    ?`We don’t have confirmation of whether ${topic} requires a booking.`:`No tenemos confirmado si hace falta reservar para ${topic}.`;
  if(/donde|where|ubicaci|locat/.test(text))return en
    ?`We don’t have a confirmed location for ${topic}.`:`No tenemos confirmada la ubicación de ${topic}.`;
  if(/confirm|segur[oa]|rely on/.test(text))return en
    ?`We can’t confirm that from the information we have about ${topic}.`:`No podemos confirmarlo con la información que tenemos sobre ${topic}.`;
  if(evidence.reason==='conflicting')return en
    ?`We have conflicting information about ${topic}, so we can’t confirm which is correct.`:`Tenemos información contradictoria sobre ${topic}; no podemos confirmar cuál es correcta.`;
  if(/hora|horario|when|time|open|clos/.test(text))return en
    ?`We don’t have confirmed hours for ${topic}.`:`No tenemos confirmado el horario de ${topic}.`;
  return en?`We don’t have that information confirmed for ${topic}.`:`No tenemos ese dato confirmado sobre ${topic}.`;
}

// Used only when the server reports a limitation; a draft passes an explicit
// read-only marker and must not claim that its current text has been saved.
export function reviewServiceReply({message,language='es',multiple=false,draft=false}) {
  const turn=serviceTurn(message),en=language.startsWith('en');
  if(!['es','en'].includes(language.slice(0,2)))return null;
  if(turn.human)return en?'Of course. You want to speak with a person; we don’t have confirmation that anyone is attending yet.'
    :'Claro, prefieres hablar con una persona. Aún no tenemos confirmación de que alguien esté atendiendo la petición.';
  if(turn.cancellation && multiple && /mantengo|mantener|keep|still need/.test(normalizeServiceText(message)))return en
    ?'You’re withdrawing part of the request and keeping the rest. We can’t confirm cancellation or separate registration; we need to review this with the team.'
    :'Retiras parte de lo pedido y mantienes lo demás. No podemos confirmar una cancelación ni un registro separado; necesitamos revisarlo con el equipo.';
  if(turn.cancellation)return en?'We understand you no longer want this request. We can’t confirm cancellation; it needs the team’s review.'
    :'Entendemos que ya no quieres esa petición. No podemos confirmar su cancelación; necesitamos revisarla con el equipo.';
  if(multiple && turn.progress)return en?'We don’t have confirmation that either request is being handled yet.'
    :'Aún no tenemos confirmación de que se haya empezado a atender ninguna de las dos peticiones.';
  if(multiple && turn.preserveMessage)return en
    ?(draft?'Your message includes both needs; their separate registration still needs review.':'Both needs remain in your message. We don’t yet have a separate record for each one.')
    :(draft?'Tu mensaje incluye las dos necesidades; su registro por separado sigue pendiente de revisión.':'Las dos necesidades se conservan en tu mensaje. Aún no tenemos un registro separado de cada una.');
  if(multiple)return en?'You’re asking for separate things. We need to review them together before we can confirm each request.'
    :'Nos pides cosas distintas. Necesitamos revisarlas juntas antes de poder confirmar cada petición.';
  return en?'We can’t identify a single request to cancel. Which one do you mean?':'No podemos identificar una única petición que cancelar. ¿A cuál te refieres?';
}
