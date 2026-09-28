# Guest Memory OFF: límite de memoria personal persistente

Fecha: 2026-09-28. Base: `origin/main` `c30156baec02a0e14731151d27f16275c902edd7` (PR #26). Rama: `codex/guest-memory-off-boundary`. Se preservan PR #14 (retención) y el resto de correcciones publicadas; organizaciones/PR #11 no forma parte del diff.

## Alcance y causas

La guarda de `guest_memory` ya bloqueaba su lectura, extracción, escritura y uso en prompts. Sin embargo, `processGuestMessage` construía y persistía un perfil independiente, afinidades, señales, sentimiento longitudinal y predicciones, también con OFF. Inbox consultaba esos perfiles; Concierge los incorporaba al payload y pedía `guest_insights`; postestancia leía perfiles sin la guarda. PMS podía generar/conservar un VIP inferido y preferencias en un registro mixto de estancia. Estos recorridos quedan bajo el mismo `isGuestMemoryEnabled`: solo la cadena exacta `true` habilita memoria; ausencia, vacío y valores inválidos siguen OFF.

No hay migración, cambio de permisos, configuración, activación, limpieza ni programación de trabajos en este cambio. ON se prueba exclusivamente con identidades sintéticas y adaptadores aislados.

## Fuentes y tratamiento por campos

| Fuente / campo | Naturaleza y reutilización | OFF | Operación conservada |
| --- | --- | --- | --- |
| `guest_memory`: tipo, clave, valor, confianza y referencias | Memoria personal entre conversaciones | Sin lectura funcional, extracción, escritura ni inclusión en prompts; API deshabilitada | Mensaje actual y petición explícita del huésped |
| `guest_intelligence_profiles`: tipo, resumen, puntuaciones, idioma/país inferidos, `metadata.detected_from` | Perfil personal persistente | No se construye, guarda ni consulta para personalización | Idioma, teléfono y habitación del contexto operativo autorizado |
| `guest_interest_affinities`, `guest_behavior_signals`, `guest_sentiment_history`, `guest_revenue_predictions` | Afinidades, señales y sentimiento longitudinal; probabilidad comercial futura | Escritores bloqueados antes de abrir DB; lectores/consumidores bloqueados | Sentimiento/urgencia actuales de la conversación y acciones solicitadas |
| `guest_ai_profiles/tags/insights/actions` | Perfil alternativo y derivados | Generador y API deshabilitados; seed de perfiles respeta OFF; no se borran históricos | Tickets y registros operativos separados del seed |
| `guest_stay_context`: `vip_score`, `revenue_potential`, `transfer_likely`, `experience_likely`, extensiones personales de `raw_payload` | Campos mixtos: inferencia personal dentro de contexto PMS | No se generan puntuaciones personales ni se incluyen esos campos en nuevos upserts/contextos; no se limpian columnas antiguas ni se sobrescribe el `raw_payload` histórico en un refresco OFF | Identidad hotel/huésped/reserva, habitación, fechas, ocupación de estancia, idioma/país de reserva, elegibilidad de upgrade/late checkout basada en estancia/disponibilidad |
| `pms_intelligence_logs.output_context` y eventos PMS nuevos | Copia del contexto de estancia | Proyección operativa, sin perfil VIP ni evento `vip_guest_detected` | Check-in/out, habitación, ocupación, mantenimiento y elegibilidad operativa |
| `conversation_ai_state`: sentimiento, intención, escalación, `state_metadata.human_takeover`, `conversation_ai_mode`, referencias de seguimiento | Estado operativo de la conversación | Conservado; no se vacía la tabla ni su metadata | Control humano, urgencia, cooldown y escalación |
| `conversation_ai_state.ai_summary/ai_reasoning/last_ai_response`; `ai_logs` texto/razonamiento | Texto mixto de atención y trazabilidad de la conversación actual | Puede seguir guardándose para su finalidad operativa. No se envía como perfil histórico; prompt usa campos explícitos de intención/sentimiento/escalación | Respuestas, incidencias, diagnóstico de atención. Conservación independiente pendiente |
| Mensajes, tickets, reserva autorizada, Knowledge y solicitudes de servicio | Atención actual; algunas fuentes contienen datos personales operativos | Se mantienen con ámbito de hotel. OFF no significa ausencia de datos personales en proveedores | Conversación normal, reserva, información del hotel, seguimiento y control humano |
| Postestancia | Evaluación operativa de incidencias de estancia | Sin consulta de perfiles ni uso de VIP/riesgo personal en metadata; agrupación por hotel+huésped | Incidentes urgentes, tickets no resueltos, revisión humana y guardas de preview/envío existentes |

## Cambios y puntos de control

- `src/services/staynex.service.js:processGuestMessage`: la construcción/persistencia de Guest Intelligence y predicción queda dentro de la guarda; el contexto personal se inicializa vacío.
- `guest-intelligence.service.js`: `buildGuestIntelligenceProfile`, `persistGuestIntelligenceProfile`, `getGuestIntelligenceContext`; `revenue-ai.service.js:persistRevenuePrediction`; `guest-memory-ai.service.js:generateGuestProfile`: guardas en las entradas, también para otros llamadores.
- `shared/guest-memory/personalization-boundary.js`: proyección explícita de campos operativos. Usada por persistencia/lectura PMS, Concierge y presentación Inbox. No modifica el objeto original ni borra históricos.
- `openai-concierge.service.js`: OFF elimina perfil y memoria del payload, filtra campos personales PMS y no solicita `guest_insights` en el esquema de respuesta. Descarta insights inesperados; `generateGuestInsights` no llama al proveedor cuando está deshabilitado.
- `dashboard/lib/inbox.js`: no consulta tablas de perfiles con OFF; `ai-copilot.js` requiere la habilitación explícita del DTO del servidor. El panel muestra «Memoria personal desactivada», sin inventar un porcentaje VIP. Borradores siguen usando mensajes actuales, reserva autorizada y Knowledge.
- `post-stay-review-intelligence.service.js`, `automation-intelligence.service.js`, simulación y seed alternativo: mismo límite, manteniendo las guardas de operación. El consumidor de postestancia consulta y agrupa por ámbito hotel+huésped.

## Evidencia local y CI

Nueva suite `test:guest-memory-personalization-boundary` en `ci:critical`: 18 grupos de comportamiento. Ejecuta los métodos reales con adaptadores DB/proveedor sintéticos y captura solicitudes de los adaptadores reales de generación principal y Concierge. Comprueba valores OFF ausente/inválido, no escrituras/lecturas/extracción, perfiles ON autorizados, aislamiento, persistencia de estado operativo, PMS y postestancia en segundo plano, Inbox, simulación y seed. El bloque real de generación principal se ejecuta con trampas para los extractores/personificadores; las capturas de SDK prueban los prompts reales, no una búsqueda de nombres en código.

También se conservan las regresiones de memoria OFF (4 grupos), piloto, retención, aislamiento, contratos de envío, control humano/seguimiento y calidad final (92 generaciones históricas sintéticas reproducidas y 36 borradores). La suite de Guest Intelligence ON se incorpora al job crítico. Sus flags son locales al proceso de prueba; no se transmite una clave real.

`test:pms-intelligence` pasa con ON explícito en el ensayo sintético. El fallo adicional heredado de `test:guest-ai-tenant-isolation` continúa separado: su comprobación estática exige `withHotel(supabase.from('ai_logs'))` en el Dashboard ejecutivo, cuyo loader cambió previamente; no se modifica ni se presenta como PASS. Los escenarios de escritura y aislamiento anteriores a ese assert sí se ejecutan. El control estático HTTP puede fallar en Windows por CRLF; no se debilita y el CI Linux es la referencia para ese control.

Resultados finales de CI, SHA, despliegue y lectura pública se añadirán al cierre local tras la publicación.

## Propuesta de datos históricos (no ejecutada)

1. **Reglas existentes:** mantener las configuraciones de cada hotel. El job de PR #14 usa `anonymize_after_checkout_days` o `guest_data_retention_days` (fallback existente 30 días) y `delete_message_body_after_days` (fallback existente 90). Los mensajes requieren además huésped elegible; una estancia posterior o checkout desconocido protege la limpieza a nivel de huésped. No se proponen nuevos plazos ni se extiende esta regla a perfiles independientes.
2. **Pendiente por fuente:** valores/claves/referencias de `guest_memory` y copias elegibles en `ai_logs` siguen bajo la corrección de PR #14, todavía sin ejecutar históricamente. Para perfiles, tags, señales, sentimiento longitudinal, afinidades y predicciones hace falta decidir finalidad, periodo/disparador, tratamiento de huéspedes recurrentes y alcance por hotel. Para resúmenes/razonamiento, metadata y logs PMS mixtos hay que separar texto personal de evidencia de incidente/servicio antes de aprobar su supresión.
3. **Impacto de dejar de conservar:** se pierde la personalización entre estancias, inferencia VIP y probabilidad comercial personal; no debe perderse atención actual, tickets, reserva, trazabilidad de acciones humanas ni justificación de incidencias. Resúmenes operativos necesitan una decisión propia: eliminarlos reduce trazabilidad, aunque el historial normal aún exista.
4. **Revisión previa sin escritura:** inventario privado por hotel/fuente/campo, identificadores técnicos, fechas y categorías; recuentos de elegibles/protegidos y muestras minimizadas, sin volcar texto sensible en Git. Ejecutar solo el dry-run existente para su ámbito aprobado; para fuentes sin política generar un manifiesto de candidatos separado, sin convertirlo en autorización. Fijar fecha de corte, criterios y hash de la revisión.
5. **Concurrencia:** acreditar versiones de todos los escritores, mantener OFF y controlar importaciones/consumidores antiguos antes de una futura limpieza. Revalidar todas las estancias y elegibilidad inmediatamente antes de cada lote y al reanudar; si entran escrituras concurrentes o cambia una reserva, diferir esos registros. La limpieza existente no ofrece una transacción global entre tablas: si no puede asegurarse una ventana coherente, habrá que preparar bloqueo/transacción acotados y revisarlos antes de ejecutar.
6. **Fallos y recuperación:** conservar manifiesto, lotes/cursors, errores parciales y respaldo privado mínimo, cifrado y con acceso limitado según decisión aprobada. Un error no se anuncia como completo. Reanudar de forma idempotente tras revalidación; no restaurar indiscriminadamente datos cuya supresión fue aprobada. Un respaldo no debe convertirse en otra conservación indefinida. Recuperar controles operativos afectados de forma selectiva, sin reactivar perfiles ni jobs antiguos que los recreen.

## Publicación y verificación

Publicar rama/PR y exigir los jobs críticos, build y PostgreSQL para el SHA final; revisión sin bloqueos; merge normal. Sin migración. Comprobar Vercel y Railway en el SHA integrado, flags efectivos y salud, e Inbox/Asistencia IA en la sesión autenticada mediante lectura. Conservar el inventario privado previo y comparar tras publicar: 42 mensajes, 15 conversaciones pobladas y 5 vacías; incluye el contenido exacto de las seis respuestas de presentación. No generar mensajes ni cambiar controles en producción para probar OFF.

## Texto de auditoría (utilizar tras verificar publicación)

«Corregido el límite técnico de Guest Memory OFF: bloquea la generación, persistencia y reutilización como personalización de memorias, perfiles y derivados en los recorridos revisados, incluidos consumidores alternativos. Se conserva el contexto operativo autorizado y el control humano. No se han eliminado datos históricos ni programado limpiezas. La revisión de conservación y tratamiento de datos permanece abierta; el punto 1 completo no está cerrado.»
