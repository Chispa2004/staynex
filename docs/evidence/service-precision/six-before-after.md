# Seis conversaciones completas: 01d8f15 frente a la corrección local

**Regresión con dobles de IA y PostgreSQL desechable real. No es una comparación real de naturalidad.** La línea base se reutiliza de `../service-arrival-correction/after-final.json.gz`, ruta principal. El acuse generado por proveedor está desactivado en este ensayo local (fallback compartido real); se prueba por separado con generaciones controladas y replays históricos. Ningún texto se ha editado manualmente.

## D02 — Fictional Juniper Quay Hotel

**Huésped:** I arrive at 00:50 on November 8. How do I enter?

**Antes:** Late arrival must be arranged before 20:00 on the evening before arrival. The side entrance is used only after the hotel confirms arrangements. Reception is open from 06:00 to 21:00. For 00:50 on november 8, that means before 20:00 the previous evening (2026-11-07), not that same afternoon. Building access does not confirm room availability; your arrival is before check-in on 2026-11-08 at 16:30. Early room access needs confirmation.

**Después:** For your 00:50 arrival: Late arrival must be arranged before 20:00 on the previous evening, 7 November. The side entrance is used only after the hotel confirms arrangements. Reception is open from 06:00 to 21:00. Building access does not confirm room availability; room access before check-in at 16:30 on 8 November needs confirmation.

**Huésped:** Does an open entrance mean my room is ready?

**Antes:** Building access does not confirm room availability; your arrival is before check-in on 2026-11-08 at 16:30. Early room access needs confirmation.

**Después:** Building access does not confirm room availability; room access before check-in at 16:30 on 8 November needs confirmation.

**Huésped:** My booked arrival date is November 8.

**Antes:** Your 00:50 arrival is before check-in on 2026-11-08 at 16:30. Early room access still needs confirmation.

**Después:** Your 00:50 arrival is before check-in at 16:30 on 8 November. Early room access still needs confirmation.

## D06 — Fictional Juniper Quay Hotel

**Huésped:** When does breakfast start?

**Antes:** We have conflicting information about breakfast, so we can’t confirm which is correct.

**Después:** We have conflicting information about breakfast, so we can’t confirm which is correct.

**Huésped:** Is 05:00 the confirmed time?

**Antes:** We can’t confirm that from the information we have about breakfast.

**Después:** We can’t confirm that from the information we have about breakfast.

**Huésped:** Where is the gym?

**Antes:** We don’t have a confirmed location for the gym.

**Después:** We don’t have a confirmed location for the gym.

## D07 — Hotel ficticio Faro de Arcilla

**Huésped:** Necesito dos toallas adicionales.

**Antes:** Ya tenemos tu petición sobre toallas para la habitación F-617.

**Después:** Ya tenemos tu petición sobre 2 toallas para la habitación F-617.

**Huésped:** Mejor tres, no dos.

**Antes:** Perfecto, hemos actualizado la petición a 3 toallas.

**Después:** Perfecto, hemos actualizado la petición a 3 toallas.

**Huésped:** ¿Cómo va lo mío?

**Antes:** Tu petición sigue pendiente; todavía no tenemos una actualización.

**Después:** Tu petición sigue pendiente; todavía no tenemos una actualización.

## D09 — Hotel ficticio Faro de Arcilla

**Huésped:** Necesito limpieza en mi habitación.

**Antes:** Ya tenemos tu petición sobre limpieza para la habitación F-617.

**Después:** Ya tenemos tu petición sobre limpieza para la habitación F-617.

**Huésped:** ¿Cómo va la limpieza?

**Antes:** Nos estamos ocupando de ello.

**Después:** Nos estamos ocupando de ello.

**Huésped:** ¿Ya habéis terminado?

**Antes:** Hemos completado esta petición.

**Después:** Hemos completado esta petición.

## D11 — Hotel ficticio Faro de Arcilla

**Huésped:** El aire acondicionado pierde agua.

**Antes:** Tu mensaje se conserva, pero no he podido confirmar el registro de la solicitud. Puedes reintentarlo aquí; si necesitas atención inmediata, acude a recepción.

**Después:** Tu mensaje se conserva, pero no he podido confirmar el registro de la solicitud. Puedes reintentarlo aquí; si necesitas atención inmediata, acude a recepción.

**Huésped:** Sigue el mismo problema del aire acondicionado.

**Antes:** Tu petición sigue pendiente; todavía no tenemos una actualización.

**Después:** Ahora sí, hemos registrado tu petición sobre la incidencia del aire acondicionado para la habitación F-617.

**Huésped:** Quiero hablar con una persona.

**Antes:** Claro, tenemos tu petición de hablar con una persona.

**Después:** Claro, tenemos tu petición de hablar con una persona.

## F01 — Fictional Juniper Quay Hotel

**Huésped:** Could you bring two pillows?

**Antes:** We have your request about an extra pillow for room J-842.

**Después:** We have your request about 2 pillows for room J-842.

**Huésped:** Make it four instead.

**Antes:** Thanks, we’ve updated your request to 4 pillows.

**Después:** Thanks, we’ve updated your request to 4 pillows.

**Huésped:** Thanks, that's all.

**Antes:** You’re welcome.

**Después:** You’re welcome.
