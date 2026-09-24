// Fictional input only. AI replies are produced by the real analysis service,
// never stored as hand-written expected replies here.
export const checkinAiCases = [
  {slot:'ai-night',name:'Nora Ejemplo',stage:'pre',arrival:1,departure:4,turns:['Llegaremos a medianoche con nuestra reserva. ¿Cómo entramos al hotel a esa hora?', 'Será sobre las 00:30. ¿Tengo que esperar hasta la mañana?']},
  {slot:'ai-cot',name:'Leo Ejemplo',stage:'pre',arrival:2,departure:5,turns:['Viajamos con un bebé y necesitamos una cuna. ¿Podemos pedirla?', 'Tiene nueve meses. ¿La cuna ya está confirmada?']},
  {slot:'ai-breakfast',name:'Vera Ejemplo',stage:'stay',arrival:-1,departure:2,turns:['¿A qué hora y dónde se sirve el desayuno?', 'Si bajo a desayunar a las 10:15, ¿todavía estaré dentro del horario que me has dicho?']},
  {slot:'ai-noise',name:'Hugo Ejemplo',stage:'stay',arrival:-1,departure:2,turns:['Hay mucho ruido en el pasillo de mi habitación y no puedo descansar.', 'Sigue el mismo ruido y estoy bastante molesto. Necesito que alguien de recepción lo revise.']},
  {slot:'ai-lost',name:'Inés Ejemplo',stage:'post',arrival:-4,departure:-1,turns:['Creo que dejé una bufanda verde en el hotel al salir ayer. ¿Cómo puedo consultarlo?', 'Soy Inés Ejemplo, habitación DEMO-405. ¿Podéis enviarme ya la bufanda verde que olvidé?']},
  {slot:'ai-return',name:'Dani Ejemplo',stage:'post',arrival:-5,departure:-2,turns:['Muchas gracias por la estancia, nos ha gustado mucho. ¿Cómo consulto una próxima visita?', 'Quizá volvamos en noviembre. ¿Hay disponibilidad o algún descuento?']}
];
export const syntheticKnowledgeAdditions = [
  {key:'demo_llegada_nocturna',value:'Información ficticia exclusiva de Hotel Demo Checkin: recepción está atendida 24 horas. Para llegada nocturna, acudir a recepción por la entrada principal y comunicar la hora aproximada de llegada. No existe código de puerta ni acceso digital en esta demo. Una entrada antes del horario de check-in requiere que recepción confirme disponibilidad; no se garantiza habitación anticipada.'},
  {key:'demo_cunas',value:'Información ficticia exclusiva de Hotel Demo Checkin: las cunas se solicitan a recepción indicando edad del bebé y fechas de estancia. Están sujetas a disponibilidad y confirmación del equipo. La IA no puede confirmarlas.'},
  {key:'demo_limites_operativos',value:'Contexto del ensayo ficticio: no se ha ejecutado ninguna acción externa, reserva, envío, aviso a recepción, mantenimiento, factura, búsqueda ni envío de objetos. Solo se genera texto para revisión. No afirmes haber realizado ni que realizarás esas acciones: explica quién debe revisarlas y pide los datos mínimos necesarios. Si se necesita intervención humana, indícalo sin afirmar que se ha contactado con nadie. No inventes precios, promociones, disponibilidad ni descuentos.'}
];
