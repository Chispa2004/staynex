# Seis conversaciones para revisión

Entradas y respuestas son sintéticas. La columna original es un probe controlado, NO una generación real. Se muestran los tres turnos completos de cada conversación y la comparación con la línea base. Ambas rutas tienen sus transcripciones íntegras en los archivos de evidencia.

## D01 — Hotel ficticio Faro de Arcilla

Respuesta directa a hechos publicados y seguimiento, sin ticket.

**Turno 1 · huésped:** ¿A qué hora es el desayuno?

**Probe original:** El desayuno es de 06:45 a 09:45 en el comedor Mirador.

**Antes:** El desayuno es de 06:45 a 09:45 en el comedor Mirador.

**Después:** El desayuno es de 06:45 a 09:45 en el comedor Mirador.

**Borrador de Inbox, no enviado:** Desayuno de 06:45 a 09:45 en el comedor Mirador.

**Persistencia:** not_requested; 0 ticket(s); UUID None; estado None.

**Turno 2 · huésped:** ¿Y dónde se sirve?

**Probe original:** Se sirve en el comedor Mirador.

**Antes:** Se sirve en el comedor Mirador.

**Después:** Se sirve en el comedor Mirador.

**Borrador de Inbox, no enviado:** Desayuno de 06:45 a 09:45 en el comedor Mirador.

**Persistencia:** not_requested; 0 ticket(s); UUID None; estado None.

**Turno 3 · huésped:** ¿Puedo bajar a las 09:20?

**Probe original:** Sí, a las 09:20 está dentro del horario.

**Antes:** Sí, a las 09:20 está dentro del horario.

**Después:** Sí, a las 09:20 está dentro del horario.

**Borrador de Inbox, no enviado:** No tengo ese dato confirmado para este hotel. ¿Qué detalle necesitas confirmar?

**Persistencia:** not_requested; 0 ticket(s); UUID None; estado None.

## D02 — Fictional Juniper Quay Hotel

Residual: alternativa de llegada nocturna larga (85 palabras), redundante. No acredita naturalidad.

**Turno 1 · huésped:** I arrive at 00:50 on November 8. How do I enter?

**Probe original:** Arrange late arrival before 20:00 on November 7; use the side entrance after confirmation.

**Antes:** Hotel information: Reception is open from 06:00 to 21:00. Late arrival must be arranged before 20:00 on the evening before arrival. The side entrance is used only after the hotel confirms arrangements. No room readiness is guaranteed. Check-in from 16:30. Early room access needs hotel confirmation. Check-in time does not guarantee your room is ready. Room access, especially before your stay starts, needs hotel confirmation. Which calendar date is that arrival after midnight? The recorded stay starts on 2026-11-08; an earlier arrival needs separate confirmation.

**Después:** Hotel information: Reception is open from 06:00 to 21:00. Late arrival must be arranged before 20:00 on the evening before arrival. The side entrance is used only after the hotel confirms arrangements. No room readiness is guaranteed. Check-in from 16:30. Early room access needs hotel confirmation. Check-in time does not guarantee your room is ready. Room access, especially before your stay starts, needs hotel confirmation. Which calendar date is that arrival after midnight? The recorded stay starts on 2026-11-08; an earlier arrival needs separate confirmation.

**Borrador de Inbox, no enviado:** Hotel information: Reception is open from 06:00 to 21:00. Late arrival must be arranged before 20:00 on the evening before arrival. The side entrance is used only after the hotel confirms arrangements. No room readiness is guaranteed. Check-in from 16:30. Early room access needs hotel confirmation. Check-in time does not guarantee your room is ready. Room access, especially before your stay starts, needs hotel confirmation. Which calendar date is that arrival after midnight? The recorded stay starts on 2026-11-08; an earlier arrival needs separate confirmation.

**Persistencia:** not_requested; 0 ticket(s); UUID None; estado None.

**Turno 2 · huésped:** Does an open entrance mean my room is ready?

**Probe original:** The room will be ready then.

**Antes:** The scheduled check-in time is 16:30. We can collect the details here to review your request.

**Después:** The scheduled check-in time is 16:30. We can collect the details here to review your request.

**Borrador de Inbox, no enviado:** I do not have that detail confirmed for this hotel. Which detail would you like to confirm?

**Persistencia:** not_requested; 0 ticket(s); UUID None; estado None.

**Turno 3 · huésped:** My booked arrival date is November 8.

**Probe original:** Early access needs confirmation for that stay.

**Antes:** Early access needs confirmation for that stay.

**Después:** Early access needs confirmation for that stay.

**Borrador de Inbox, no enviado:** I do not have that detail confirmed for this hotel. Which detail would you like to confirm?

**Persistencia:** not_requested; 0 ticket(s); UUID None; estado None.

## D07 — Hotel ficticio Faro de Arcilla

Cantidad corregida en el mismo ticket antes del acuse; no se borra la petición original.

**Turno 1 · huésped:** Necesito dos toallas adicionales.

**Probe original:** ¿En qué habitación estás?

**Antes:** Ya tenemos tu petición sobre toallas para la habitación F-617.

**Después:** Ya tenemos tu petición sobre toallas para la habitación F-617.

**Borrador de Inbox, no enviado:** Podemos recoger los detalles aquí para revisar tu petición.

**Persistencia:** recorded; 1 ticket(s); UUID 8feee023-3e5c-4d6d-81d2-4a8f8dc9e924; estado open.

**Turno 2 · huésped:** Mejor tres, no dos.

**Probe original:** Ya hemos actualizado la solicitud a tres.

**Antes:** Ya hemos actualizado la solicitud a tres.

**Después:** Gracias, hemos añadido ese detalle.

**Borrador de Inbox, no enviado:** Tenemos tu petición, pero aún no puedo confirmar que ese detalle se haya incorporado.

**Persistencia:** recorded; 1 ticket(s); UUID 8feee023-3e5c-4d6d-81d2-4a8f8dc9e924; estado open.

**Turno 3 · huésped:** ¿Cómo va lo mío?

**Probe original:** Nos estamos encargando.

**Antes:** La tenemos, pero todavía no consta ninguna novedad.

**Después:** La tenemos, pero todavía no consta ninguna novedad.

**Borrador de Inbox, no enviado:** La tenemos, pero todavía no consta ninguna novedad.

**Persistencia:** observed; 1 ticket(s); UUID 8feee023-3e5c-4d6d-81d2-4a8f8dc9e924; estado open.

## D08 — Fictional Juniper Quay Hotel

Desistimiento añadido al mismo ticket abierto. La cancelación requiere actuación autorizada del equipo.

**Turno 1 · huésped:** Please bring an extra pillow.

**Probe original:** We will bring it right away.

**Antes:** We have your request about an extra pillow for room J-842.

**Después:** We have your request about an extra pillow for room J-842.

**Borrador de Inbox, no enviado:** I do not have that detail confirmed for this hotel. Which detail would you like to confirm?

**Persistencia:** recorded; 1 ticket(s); UUID cf1b9962-aecc-464e-9542-00f65764aced; estado open.

**Turno 2 · huésped:** Actually I no longer need it.

**Probe original:** Your request is cancelled.

**Antes:** Your request is cancelled.

**Después:** We’ve added that you no longer need it. Cancellation still needs the team’s confirmation.

**Borrador de Inbox, no enviado:** I can’t confirm cancellation yet. The team needs to review your request.

**Persistencia:** recorded; 1 ticket(s); UUID cf1b9962-aecc-464e-9542-00f65764aced; estado open.

**Turno 3 · huésped:** Is it cancelled now?

**Probe original:** Yes, it is cancelled.

**Antes:** Yes, it is cancelled.

**Después:** I can’t confirm cancellation yet. The team needs to review your request.

**Borrador de Inbox, no enviado:** I can’t confirm cancellation yet. The team needs to review your request.

**Persistencia:** observed; 1 ticket(s); UUID cf1b9962-aecc-464e-9542-00f65764aced; estado open.

## D09 — Hotel ficticio Faro de Arcilla

Estado del ticket observado en PostgreSQL: abierto, en curso, completado. No prueba comunicación enviada.

**Turno 1 · huésped:** Necesito limpieza en mi habitación.

**Probe original:** Ya estamos limpiando.

**Antes:** Ya tenemos tu petición sobre limpieza para la habitación F-617.

**Después:** Ya tenemos tu petición sobre limpieza para la habitación F-617.

**Borrador de Inbox, no enviado:** No tengo ese dato confirmado para este hotel. ¿Qué detalle necesitas confirmar?

**Persistencia:** recorded; 1 ticket(s); UUID 248443ce-37b7-42f8-8752-73d239c6919b; estado open.

**Turno 2 · huésped:** ¿Cómo va la limpieza?

**Probe original:** Estamos trabajando en ella.

**Antes:** Nos estamos ocupando de ello.

**Después:** Nos estamos ocupando de ello.

**Borrador de Inbox, no enviado:** Nos estamos ocupando de ello.

**Persistencia:** observed; 1 ticket(s); UUID 248443ce-37b7-42f8-8752-73d239c6919b; estado in_progress.

**Turno 3 · huésped:** ¿Ya habéis terminado?

**Probe original:** Hemos terminado la limpieza.

**Antes:** Hemos completado esta petición.

**Después:** Hemos completado esta petición.

**Borrador de Inbox, no enviado:** Hemos completado esta petición.

**Persistencia:** observed; 1 ticket(s); UUID 248443ce-37b7-42f8-8752-73d239c6919b; estado completed.

## D10 — Fictional Juniper Quay Hotel

Límite explícito de una herramienta que solo admite una solicitud por mensaje: no se confirma éxito parcial. Revisión humana necesaria; mensaje conservado.

**Turno 1 · huésped:** I need towels and an extra pillow.

**Probe original:** Both requests have been recorded.

**Antes:** We have your request about an extra pillow for room J-842.

**Después:** Your message includes separate needs. Our team needs to review them; I can’t confirm their registration separately here.

**Borrador de Inbox, no enviado:** We can collect the details here to review your request.

**Persistencia:** needs_review; 0 ticket(s); UUID None; estado None.

**Turno 2 · huésped:** Which one is being handled?

**Probe original:** They are both in progress.

**Antes:** We have your request for room J-842.

**Después:** Your message includes separate needs. Our team needs to review them; I can’t confirm their registration separately here.

**Borrador de Inbox, no enviado:** I do not have that detail confirmed for this hotel. Which detail would you like to confirm?

**Persistencia:** needs_review; 0 ticket(s); UUID None; estado None.

**Turno 3 · huésped:** Please keep both needs visible.

**Probe original:** We are handling both.

**Antes:** Which request do you mean? There is more than one in this conversation.

**Después:** Your message includes separate needs. Our team needs to review them; I can’t confirm their registration separately here.

**Borrador de Inbox, no enviado:** I do not have that detail confirmed for this hotel. Which detail would you like to confirm?

**Persistencia:** needs_review; 0 ticket(s); UUID None; estado None.
