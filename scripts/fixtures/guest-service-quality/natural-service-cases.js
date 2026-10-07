// Synthetic policy/identity fixtures. Dates are scenario time, not today's stays.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const cases=[
 ['night','pre',['Llegamos a las 00:30 del 2026-09-16. ¿Por dónde entramos?','¿Entonces podemos entrar ya en la habitación a esa hora?']],
 ['cot','pre',['Viajamos con un bebé de nueve meses y necesitamos una cuna.','Sí, una cuna para toda la estancia. ¿Ya está confirmada?']],
 ['transfer','pre',['Necesitamos un traslado desde el aeropuerto. Somos dos adultos.','Llegamos en el vuelo ficticio DEMO123 a las 18:00 del 2026-09-16. ¿Queda reservado?']],
 ['towels','stay',['¿Podéis traer dos toallas más a nuestra habitación?','Las dos son de baño. ¿Tenéis la petición?']],
 ['leak','stay',['El aire acondicionado pierde agua y está mojando el suelo. Necesitamos ayuda.','Sigue perdiendo agua por el mismo aparato. ¿Tenéis la incidencia?']],
 ['breakfast','stay',['¿A qué hora y dónde se sirve el desayuno?','¿Podemos bajar a las 10:15?']],
 ['lost','post',['Creo que dejé algo en la habitación al salir, ¿podéis buscarlo?','Era una bufanda azul en el armario de la habitación 301. ¿La habéis encontrado?']],
 ['invoice','post',['Necesito la factura de mi estancia anterior.','Es la factura de la estancia completa a mi nombre. ¿Ya está emitida?']],
 ['return','post',['Nos gustaría volver. ¿Hay alguna promoción y cómo podemos reservar?','Seríamos dos adultos del 2026-11-05 al 2026-11-08. Quiero que reviséis una nueva reserva.']]
];
const knowledgeA=[['check_in','El check-in empieza a las 15:00.'],['llegada_nocturna','Recepción está atendida 24 horas. Para llegada nocturna, acudir por la entrada principal y comunicar la hora aproximada de llegada. Una entrada antes del check-in requiere confirmar disponibilidad; no se garantiza habitación anticipada.'],['cunas','Las cunas se solicitan indicando edad y fechas de estancia, sujetas a disponibilidad y confirmación.'],['transfer','Recepción puede solicitar transfer al aeropuerto con antelación.'],['breakfast','El desayuno se sirve de 07:30 a 10:30 en el restaurante principal.'],['lost_property','Objetos perdidos: nombre, fecha y habitación.']];
const knowledgeB=[['check_in','El check-in empieza a las 16:00.'],['late_arrival','Reception opens 09:00–21:00. Late arrival must be arranged by calling before 21:00, before arrival; use the side entrance only after hotel confirmation. Early room access is not guaranteed.'],['cots','Cots must be requested with baby age and stay dates; availability must be confirmed.'],['transfer','The hotel does not operate airport transfers. Taxis are available at the airport taxi rank; no hotel booking is made.'],['breakfast','Breakfast is served from 08:00 to 11:00 in the garden lounge.'],['booking','Official booking channel: https://hotel-b.example.test/book'],['promotion','10% off stays from 2026-11-01 until 2026-11-30 when booked from 2026-09-01 until 2026-10-31 through the official booking channel. Non-combinable and subject to availability.']];
export const naturalServiceCases=[1,2].flatMap(n=>cases.map(([key,phase,turns],i)=>{
 const hotel={id:id(n),name:'Synthetic hotel '+n,timezone:'Europe/Madrid',default_language:'es'};
 const guest={id:id(n*100+i),hotel_id:hotel.id,current_room:phase==='stay'?`${n===1?'A':'B'}-${209+i}`:null,preferred_language:'es'};
 const conversation={id:id(n*1000+i),hotel_id:hotel.id,guest_id:guest.id};
 const reservation={id:id(n*10000+i),hotel_id:hotel.id,guest_id:guest.id,room_number:phase==='post'?'301':guest.current_room,
  arrival_date:phase==='pre'?'2026-09-16':phase==='stay'?'2026-09-14':'2026-09-11',departure_date:phase==='pre'?'2026-09-19':phase==='stay'?'2026-09-17':'2026-09-14',status:phase==='pre'?'confirmed':phase==='stay'?'checked_in':'checked_out'};
 return {id:`${n}-${key}`,key,phase,hotel,guest,conversation,reservation,turns,
  hotelKnowledge:(n===1?knowledgeA:knowledgeB).map(([key,value])=>({hotel_id:hotel.id,key,value,is_active:true})),referenceTime:'2026-09-15T12:00:00Z'};
}));
