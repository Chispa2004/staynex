// Bounded ES/EN chronology. Guest statements describe an intention, never an
// authorization to enter. Do not infer the arrival night from a booking alone.
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const months=['january|enero','february|febrero','march|marzo','april|abril','may|mayo','june|junio','july|julio','august|agosto','september|septiembre','october|octubre','november|noviembre','december|diciembre'];
const pad=n=>String(n).padStart(2,'0');
const valid=(y,m,d)=>{const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;};
export function explicitArrivalDate(value,stayDate) {
  const text=norm(value), found=[];
  for(const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))found.push({year:+m[1],month:+m[2],day:+m[3],label:m[0]});
  months.forEach((names,index)=>{
    for(const re of [new RegExp(`\\b(?:${names})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,'g'),new RegExp(`\\b(\\d{1,2})(?: de)?\\s+(?:${names})(?:(?: de)?\\s+(\\d{4}))?\\b`,'g')])
      for(const m of text.matchAll(re))found.push({year:m[2]?+m[2]:null,month:index+1,day:+m[1],label:m[0]});
  });
  const unique=[...new Map(found.map(d=>[`${d.year}-${d.month}-${d.day}`,d])).values()];
  if(unique.length!==1)return {date:null,label:null,ambiguous:unique.length>1};
  const d=unique[0];
  if(!valid(d.year||2000,d.month,d.day))return {date:null,label:null,ambiguous:true};
  // A missing year is resolved only when month/day match the authorized stay.
  const year=d.year || (stayDate?.slice(5)===`${pad(d.month)}-${pad(d.day)}`?+stayDate.slice(0,4):null);
  return {date:year?`${year}-${pad(d.month)}-${pad(d.day)}`:null,label:d.label,ambiguous:false};
}
export function arrivalDetails(plan) {
  const details=plan.guest_details || [];
  // Booking-date clarification must not replace an explicitly supplied arrival.
  const arrival=[...details].reverse().find(t=>/arriv|lleg|\b(?:[01]?\d|2[0-3]):[0-5]\d\b|medianoche|midnight/.test(norm(t)) && !/booked arrival|booking starts|reserva (?:empieza|comienza)/.test(norm(t)));
  const current=details.at(-1);
  const currentDate=explicitArrivalDate(current,plan.stay?.arrival_date);
  const bookedClarification=/booked arrival|booking starts|reserva (?:empieza|comienza)|fecha de (?:mi |la )?reserva/.test(norm(current));
  const dated=!bookedClarification&&(currentDate.label||currentDate.ambiguous)?currentDate:explicitArrivalDate(arrival,plan.stay?.arrival_date);
  const time=norm(arrival).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return {...dated,time:time?`${pad(time[1])}:${time[2]}`:null,text:norm(arrival),
    reportedArrangement:/(?:already|ya).{0,45}(?:confirm|arrang|instructions|coordin|instrucciones)|(?:confirm|arrang|coordin).{0,35}(?:already|ya)/.test(norm(details.at(-1)))};
}

export function arrivalReplyText(plan,message,language) {
  const en=language==='en', current=norm(message), details=arrivalDetails(plan);
  const sentences=plan.knowledge.flatMap(r=>String(r.value||'').split(/(?<=[.!?;])\s+/u)).filter(Boolean);
  const checkSentence=sentences.find(s=>/check.?in/.test(norm(s)));
  const checkTime=checkSentence?.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/)?.[0]?.padStart(5,'0');
  const roomFollowup=/habitacion|room/.test(current) && /ready|lista|disponib|mean|significa|garanti|confirm|\by la\b|what about|podemos entrar|puedo entrar|can .{0,12}(?:enter|access|have)/.test(current);
  const dateFollowup=/booked arrival|booking starts|fecha de (?:mi |la )?reserva/.test(current);
  const before=details.date && plan.stay?.arrival_date && (details.date<plan.stay.arrival_date || details.date===plan.stay.arrival_date&&details.time&&checkTime&&details.time<checkTime);
  const dateLabel=value=>value?new Intl.DateTimeFormat(en?'en-GB':'es-ES',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):null;
  const checkLabel=checkTime?(en?` at ${checkTime}`:` a las ${checkTime}`):'';
  const early=before?(en?` before check-in${checkLabel} on ${dateLabel(plan.stay.arrival_date)}`:` antes del check-in${checkLabel} del ${dateLabel(plan.stay.arrival_date)}`):'';
  const room=en?`Building access does not confirm room availability; room access${early} needs confirmation.`:`Entrar al edificio no confirma la disponibilidad de la habitación; el acceso${early} necesita confirmación.`;
  if(dateFollowup&&before)return en?`Your ${details.time?details.time+' ':''}arrival is before check-in${checkLabel} on ${dateLabel(plan.stay.arrival_date)}. Early room access still needs confirmation.`:`Tu llegada${details.time?' a las '+details.time:''} es anterior al check-in${checkLabel} del ${dateLabel(plan.stay.arrival_date)}. El acceso anticipado sigue necesitando confirmación.`;
  if(roomFollowup||dateFollowup)return room;
  // Keep documented access conditions intact. Drop only standalone room
  // cautions replaced by the single scoped explanation below, not mixed clauses.
  const access=sentences.filter(s=>/entrance|entrada|late access|late arrival|llegada (?:tardia|nocturna)|acceso|arrang|coordina/.test(norm(s)) && !/habitacion|room|check.?in/.test(norm(s)));
  const reception=sentences.filter(s=>/recepcion|reception/.test(norm(s)) && !access.includes(s) && !/habitacion|room|check.?in/.test(norm(s)));
  const parts=[];
  if(plan.access_conflict)parts.push(en?'Our access instructions conflict; we need to confirm the correct procedure before you arrive.':'Las instrucciones de acceso se contradicen; necesitamos confirmar el procedimiento correcto antes de tu llegada.');
  else if(details.reportedArrangement)parts.push(en?'If the confirmed instructions cover this arrival, follow those instructions. I cannot verify that individual arrangement here.':'Si las instrucciones confirmadas cubren esta llegada, sigue esas instrucciones. Aquí no puedo verificar esa coordinación individual.');
  else if(access.length) {
    const previous=details.date?new Date(new Date(details.date+'T12:00:00Z').getTime()-86400000).toISOString().slice(0,10):null;
    const concrete=access.map(sentence=>details.time&&details.time<'06:00'?sentence.replace(/((?:before|antes de)\s*(?:las\s*)?\d{1,2}:\d{2})(?: on the evening before arrival)?/i,
      (_,deadline)=>deadline+(en?` on the previous evening${previous?', '+dateLabel(previous):''}`:` de la tarde anterior${previous?', '+dateLabel(previous):''}`)):sentence);
    parts.push((details.time?(en?`For your ${details.time} arrival: `:`Para tu llegada a las ${details.time}: `):'')+concrete.join(' '));
  }
  else parts.push(en?'There is no confirmed access procedure for that time here; we need to confirm how you can enter before arrival.':'No consta un procedimiento confirmado de acceso a esa hora; necesitamos confirmar cómo puedes entrar antes de tu llegada.');
  parts.push(...reception,room);
  if(!details.label) {
    if(/\bmanana\b|\btomorrow\b/.test(details.text)&&!/\b(?:la|esta|esa) manana\b/.test(details.text)&&plan.clock.date)parts.push(`${plan.clock.date} (${plan.clock.timezone}).`);
    parts.push(en?'Which calendar date is that arrival after midnight? We need it to check whether it is before your booked check-in.':'¿A qué fecha corresponde esa llegada después de medianoche? La necesitamos para distinguirla del inicio de tu reserva.');
  }
  return [...new Set(parts)].join(' ');
}
