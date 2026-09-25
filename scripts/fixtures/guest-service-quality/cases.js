// Fictional hotels and guests. No contacts, credentials, real reservations or memory.
export const evaluationCases = ['a','b'].flatMap(key=>{
 const hotel={id:`synthetic-${key}`,name:key==='a'?'Hotel sintético A':'Hotel sintético B',timezone:'Europe/Madrid',default_language:'es',check_in_time:key==='a'?'15:00':'16:00',check_out_time:'11:00'};
 const guest={id:`guest-${key}`,hotel_id:hotel.id,current_room:key==='a'?'A-204':'B-309',preferred_language:'es'};
 const breakfast=key==='a'?'Desayuno de 07:30 a 10:30 en el comedor Azul.':'Breakfast from 08:00 to 09:00 in the North room.';
 const knowledge=[{hotel_id:hotel.id,key:'breakfast',value:breakfast},{hotel_id:hotel.id,key:'night_access',value:key==='a'?'Recepción abierta 24 horas, entrada principal. Recepción abierta no garantiza habitación antes de las 15:00.':'Reception closes at 22:00. Late access must be arranged with the hotel before arrival; no access code is available here. Rooms are available only after confirmed check-in, normally 16:00.'},{hotel_id:hotel.id,key:'cots',value:key==='a'?'Cunas bajo solicitud, sujetas a disponibilidad y confirmación. Se necesita edad del bebé.':'This hotel does not offer cots.'}];
 const reservation={id:`res-${key}`,hotel_id:hotel.id,guest_id:guest.id,guest_name:'Persona ficticia',arrival_date:'2026-10-10',departure_date:'2026-10-14',reservation_status:'confirmed'};
 const common={hotel,guest,hotelKnowledge:knowledge,conversationContext:{knownRoom:guest.current_room,language:key==='a'?'es':'en',reservation,recentMessages:[],guestMemory:[],serviceCapabilities:{requestRecording:true,mode:'guest_reply'}}};
 const examples=key==='a'?[
 ['breakfast','¿Si bajo a desayunar a las 10:15 todavía estoy a tiempo?',[{sender_type:'guest',content:'¿Cuándo es el desayuno?'},{sender_type:'ai',content:breakfast}]],
 ['night','Llego a las 00:30 antes del día de entrada. ¿Puedo entrar y tener ya la habitación?',[]],
 ['cot','Necesitamos una cuna para nuestro bebé. ¿Queda confirmada?',[]],
 ['towels','¿Podéis traer dos toallas más a mi habitación?',[]],
 ['noise','Sigue el mismo ruido y no podemos dormir.',[{sender_type:'guest',content:'Hay ruido en el pasillo junto a mi habitación.'}]],
 ['lost','Dejé una bufanda verde en el armario al salir. ¿La habéis encontrado?',[]],
 ['invoice','Necesito la factura de mi estancia. ¿Me la podéis enviar?',[]],
 ['discount','¿Tenéis habitaciones disponibles con descuento para noviembre?',[]]
 ]:[
 ['breakfast','Would 10:15 still be in time for breakfast?',[{sender_type:'guest',content:'When is breakfast?'},{sender_type:'ai',content:breakfast}]],
 ['night','I arrive at 00:30 before my arrival date. Can I get in and have my room already?',[]],
 ['cot','We need a cot for our baby. Is it confirmed?',[]],
 ['towels','Could I have two extra towels in my room?',[]],
 ['noise','The same noise is continuing and we cannot sleep.',[{sender_type:'guest',content:'There is noise in the corridor next to my room.'}]],
 ['lost','I left a green scarf in the wardrobe when I checked out. Have you found it?',[]],
 ['invoice','I need the invoice for my stay. Can you send it?',[]],
 ['discount','Do you have rooms available with a discount in November?',[]]
 ];
 return examples.map(([name,message,recentMessages])=>({id:`${key}-${name}`,...common,message,conversationContext:{...common.conversationContext,recentMessages,reservation:name==='lost'?{...reservation,arrival_date:'2026-09-20',departure_date:'2026-09-24',reservation_status:'checked_out'}:reservation}}));
});
