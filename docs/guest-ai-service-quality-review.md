# Calidad del servicio de Guest AI

Fecha: 2026-09-25. Rama: `codex/guest-ai-service-quality`.
Base comprobada y actualizada: `d09b66d3ffcf3d252517b9005e6ab14b5ef3b489`.

## Causa y alcance

- `src/prompts/staynex.prompt.js` ofrecía avisar a recepción cuando faltaba información, sin distinguir una propuesta de un resultado operativo.
- `scripts/checkin-ai-rehearsal.js` añadía instrucciones propias de la demo para explicar que el huésped podía contactar con recepción. Se retiran; no se cambian las conversaciones ya cargadas.
- `processGuestMessage` combina el modelo principal, Concierge opcional, respuestas heurísticas y reparación de conversación. Las plantillas podían sustituir una respuesta informativa útil y afirmar un aviso antes de guardar el ticket. El registro real se hace después, mediante `createTicketFromAiResponse` y los dos mecanismos existentes de tickets operativos/interés.
- `getLatestReservationForGuest` elegía una estancia por orden y solo por huésped. Para el contexto de IA ahora exige hotel y una única candidata; una reserva explícita debe corresponder a ese hotel y huésped. Con varias candidatas no se adivina la estancia. Otros consumidores conservan su contrato anterior.
- El conocimiento principal ya consulta por hotel; el conocimiento local y experiencias también. No se encontró una caché compartida de Knowledge en estos recorridos. La regresión existente de traducciones/Knowledge sigue en CI. El filtrado adicional de las proyecciones rechaza identificadores de otro hotel; las proyecciones internas sin `hotel_id` siguen confiando en la consulta autorizada que las produce.
- Los borradores del copilot de Inbox son plantillas deterministas, **no generación LLM** ni consultas a Knowledge. Se corrigen sus promesas y preguntas repetidas; no se les atribuye una capacidad nueva de consultar disponibilidad o resolver Knowledge.

## Cambio aplicado

`shared/guest-service/quality.js` centraliza las instrucciones y la presentación posterior al registro. Lo usan el modelo principal, Concierge opcional y los borradores de Inbox; el ensayo consume la generación principal con capacidad de registro desactivada. No se añaden herramientas externas ni memoria persistente.

El contexto identifica idioma, habitación, estancia autorizada y capacidad de intentar un ticket. Una capacidad explícitamente desactivada anula la propuesta de ticket del modelo. El circuito normal la proporciona solo después de las guardas existentes. Los permisos, control humano, flags y detección de riesgos no se cambian.

Después de guardar, únicamente un ticket con ID y coincidencia exacta de hotel, huésped y conversación autoriza el acuse de registro. Se sustituye la prosa operativa previa del modelo por un acuse localizado que deja pendiente la actuación/disponibilidad. Se conserva una pregunta útil si falta un dato, sin volver a pedir habitación, fechas conocidas o datos fiscales/contactos sin un flujo que los requiera. El ticket conserva la descripción específica. Un error de escritura impide crear el mensaje de éxito; no se añade un mecanismo nuevo de reintento o deduplicación de tickets.

Sin ticket, un detector conservador elimina patrones conocidos de acciones no acreditadas. **No constituye una prueba semántica de cualquier texto posible**. La evaluación conserva ejemplos de incumplimiento del modelo pese al prompt. Las confirmaciones de reservas de proveedores siguen bajo su flujo existente; no se alteran ni se evalúan mediante llamadas operativas.

Se puede conservar la respuesta informativa principal cuando procede. Las decisiones de supresión comercial, petición explícita de humano y reparación prevalecen; los flags de escalado no se eliminan. Se mantiene orientación de seguridad en emergencias. Las traducciones del acuse cubren ES/EN/FR/DE/IT/PT; para otros idiomas no se inventa una traducción de una confirmación.

## Evaluación real y reproducción

64 generaciones reales, `gpt-4.1-mini`, exclusivamente con dos hoteles ficticios, sin teléfonos, emails, memoria ni reservas reales. Modelo contrastado con la variable visible de Railway. Transporte del ensayo limitado a OpenAI; persistencia de ticket simulada, ningún envío ni proveedor operativo. La copia temporal autorizada de la credencial fue eliminada al terminar.

16 entradas idénticas por fase: `before`, `after`, `after-v2`, `after-v3`. `before` usa el prompt de la base y el mismo esquema JSON. Los tres intentos posteriores se conservan, incluidos los fallidos. No son 64 ejecuciones completas del backend: la comparación real evalúa generación; la escritura y el tramo final real del backend se prueban por separado con dobles sintéticos.

Las salidas originales, metadatos e hashes de entrada se conservan **sin edición** en `docs/evidence/guest-service-quality-raw.json`. Su campo `presentedReply` corresponde a la versión de presentación de cada intento, no necesariamente al código final. `node scripts/replay-guest-service-quality.js` reproduce sin red la presentación final de las 16 salidas `after-v3`, diferenciando `providerReply` de `applicationReply`. Un acuse generado por la aplicación nunca se presenta como salida literal del modelo.

### Comparación de todos los casos

| Caso | Antes | Después: generación + presentación final reproducida | Límite observado |
| --- | --- | --- | --- |
| A desayuno | Resuelve 10:15 dentro de 07:30–10:30 | Resuelve directamente, comedor Azul | Correcto en esta muestra |
| B desayuno | Horario correcto, añade aviso a recepción | Explica que 10:15 queda fuera de 08:00–09:00 | Correcto, elimina derivación |
| A llegada nocturna | Garantiza habitación lista a las 15:00 | La aplicación mantiene hora de política y confirmación pendiente | El modelo bruto todavía inventa disponibilidad/áreas comunes; el guard reduce detalle útil |
| B llegada nocturna | Español pese a contexto inglés; deriva | Inglés, no garantiza entrada anticipada | Falta explicar mejor cierre a las 22:00 y preparar la petición; derivación persiste |
| A cuna | Pregunta edad | Pregunta solo edad; no registra aún ni confirma disponibilidad | Falta confirmar con hotel una vez aportada |
| B cuna | No hay cunas, pero ofrece aviso y cambia a español | Política correcta en inglés, sin aviso ficticio | Correcto en esta muestra |
| A toallas | Promete entrega en breve | Ticket simulado + acuse de registro pendiente | El modelo bruto sigue prometiendo entrega; el acuse lo sustituye |
| B toallas | Promete aviso/entrega en español | Ticket simulado + acuse en inglés | Sin plazo, entrega ni notificación acreditados |
| A ruido | Afirma informar a recepción | Ticket contextual + acuse pendiente | El acuse es menos personal que una respuesta libre |
| B ruido | Español y aviso ficticio | Acuse en inglés del ticket | El bruto todavía usa español y dice haber avisado |
| A objeto olvidado | Dice haber informado y que contactarán | Ticket con descripción/estancia, acuse pendiente | No declara objeto encontrado ni contacto realizado |
| B objeto olvidado | Promete informar en español | Acuse en inglés, no vuelve a pedir habitación | Búsqueda física sigue siendo humana |
| A factura | Afirma aviso/envío, pide email | Solicitud registrada; elimina pregunta fiscal no necesaria | No hay emisión o envío de factura |
| B factura | Ofrece que preparen/envíen, en español | Acuse en inglés; elimina repetición de fechas conocidas | No hay emisión o envío de factura |
| A nueva reserva/descuento | Ofrece avisar a recepción | No inventa descuento, pero sigue derivando | **No resuelto**: debería recoger fechas futuras y ocupación |
| B nueva reserva/descuento | Español, deriva | Inglés, sin precio inventado, pero deriva | **No resuelto**: no recoge datos útiles |

La presentación final conserva el idioma solicitado en los 16 casos; la generación bruta no lo logra siempre. No se declara éxito total ni una garantía universal de ausencia de alucinaciones. La primera iteración dejó promesas sin filtrar; la segunda dejó descuentos y llegada anticipada incompletos. Se conservan ambas evidencias. Aire acondicionado se comprueba con regresión determinista y contexto conocido; no se añade una llamada real distinta a las 64 autorizadas para esta evaluación.

## Pruebas y límites locales

- `test:guest-service-quality`: 15 grupos de comportamiento, dos hoteles; ejecuta el tramo real posterior a generación y `createTicketFromAiResponse` con almacenamiento simulado, fallo y recuperación. Prueba contexto ambiguo, hotel ajeno, capacidad inexistente, idioma, emergencia, borradores humanos, ofertas bloqueadas y Knowledge ausente. Incorporado a `ci:critical`.
- PASS: `test:natural-conversation`, `test:contextual-revenue`, `test:guest-memory-pilot-off`, `test:guest-memory-off-boundaries`, `test:pms-intelligence`, `test:checkin-ai-conversations`, `test:inbox` y las guardas críticas ejecutadas. Build de Dashboard PASS.
- `ci:critical` local alcanza `test:http-security`, que falla en una búsqueda literal LF de `dashboard/lib/demo.js` por checkout CRLF. La misma prueba PASS al normalizar temporalmente solo ese archivo a LF; bytes originales restaurados, sin cambio Git. El conjunto completo `ci:critical` también terminó PASS con ese ajuste temporal de finales de línea. CI Linux debe confirmar el SHA publicado.
- Fallo adicional heredado: `test:guest-ai-tenant-isolation`, aserción estática de `withHotel(supabase.from('ai_logs'))` en dashboard ejecutivo, línea 640. Reproducido en el código de base (`64cc38d` solo añade informe a `d09b66d`). No se debilita ni se declara PASS.
- `test:pms-reservation` no ejecutado con una base: su entrada exige Supabase y termina por variables ausentes tanto en rama como en base. No se suministran credenciales ni se usa una base real. La consulta de estancia modificada sí se prueba mediante el comportamiento del cliente sintético; esta tarea no modifica SQL.

## Capacidades y publicación

Puede responder a hechos documentados, utilizar contexto autorizado y preparar el ticket existente. El acuse acredita persistencia, no notificación, aceptación del equipo, disponibilidad, entrega, objeto encontrado ni factura emitida. No se añade inventario de habitaciones, descuentos, facturación, búsqueda de objetos o confirmación de proveedores. Las derivaciones comerciales y el detalle del acceso nocturno siguen necesitando mejora; no se ocultan como éxitos.

Publicación autorizada: push de esta rama, PR y merge normal únicamente con CI final aprobado y sin bloqueos de revisión. Sin migración ni cambio de configuración. Después: CI de main, SHA de Vercel/Railway, flags efectivos y lectura de Inbox; ningún envío ni regeneración de historia. La demo y sus trazas anteriores permanecen intactas. Organizaciones, Ubikos y auditoría de Daniel fuera del diff.

Primera publicación: PR #20, rama `bfd5670457e6b495cc9ec2c2378969be72996ec5`, merge normal `3c199058d78d22e2a66831c108e61ffffa263ecc`. CI de PR y push PASS; logs del run `36111744295` acreditan los 14 grupos iniciales, build y PostgreSQL. Vercel Production `GsuPPH951SVcnz6tTZ6EGCYzGKRr` Ready y dominio público en ese SHA.

La comprobación pública de Inbox detectó una omisión concreta: el borrador repetía la edad ante «nueve meses», mientras el ensayo usaba «9 meses». Se amplía el reconocimiento de cantidades explícitas con palabras y se añade el grupo 15 usando el copilot real. No se edita el mensaje histórico ni se generan llamadas adicionales. El ajuste necesita una PR complementaria, al estar #20 ya integrada. La verificación final se registra después de su publicación.
