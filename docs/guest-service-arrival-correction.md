# Llegada nocturna y respuestas completas: corrección local

13 de octubre de 2026. Rama `codex/guest-service-quality-evaluation`, base comprobada `5768682d963be4b059b0bf9937014731e88634fc`, limpia al comenzar. No se modifica la base publicada ni el trabajo de Ubikos (`bf1492ec5b704f55de8064eed1998388380dfaac`). El informe anterior se conserva como evidencia histórica.

## Resultado y causa

- `arrival-booking.js:arrivalBookingTopic` conserva los seguimientos sobre edificio/habitación y la aclaración de reserva, sin heredar una petición de otro tema. Antes perdía el contexto de D02.
- `arrival-details.js:explicitArrivalDate` reconoce fechas ISO y meses completos ES/EN, valida el calendario y detecta varias fechas. Un año ausente se toma de la reserva autorizada únicamente si coinciden mes y día; no se inventa un año para otra fecha. Una reserva por sí sola nunca prueba la noche de llegada. Fechas relativas o formatos no cubiertos requieren aclaración explicando su finalidad.
- `arrivalReplyText` compone instrucciones de acceso pertinentes antes del horario de recepción, conserva las condiciones de la entrada alternativa y explica una sola vez edificio frente a habitación. Separa la hora indicada, la fecha de reserva y el check-in. La pregunta de seguimiento recibe una respuesta centrada en esa distinción; al aclarar la fecha de reserva se explica la llegada anticipada. Se conserva el aviso previo en la tarde anterior, no después de la llegada.
- `groundedArrivalReply` rechaza la pregunta redundante por una fecha reconocida y la información de acceso contradictoria. El contrato compartido de generación pide responder al último turno sin volcar el Knowledge. Los cambios afectan Principal, Concierge y el borrador de Inbox; no se añade un transporte ni una herramienta.
- `ticket-context.js:ticketReplyPlan` nombra el artículo del ticket para una cantidad guardada y comprobada. El progreso distingue abierto/pendiente, en curso, hecho y cerrado/cancelado; no inventa actuación ni aviso. `receipt-reply.js` acepta una redacción completa de actualización y rechaza la cantidad sin artículo o distinta de la del turno para toallas/almohadas/cunas, además de conservar la comprobación de persistencia. Un fallo de proveedor conserva la alternativa acreditada, sin repetir la escritura.

No hay un contrato estructurado de confirmación individual de acceso nocturno en este recorrido. Se ha probado el caso de un huésped que afirma tener coordinación confirmada: se remite condicionalmente a esas instrucciones, sin pedir que vuelva a coordinar por sistema ni certificar su acceso. No equivale a verificar una confirmación del hotel. No se crean códigos, entradas, habitaciones listas, acuerdos ni solicitudes.

## Comparación acotada y límites de la medición

**IA real pendiente:** clave de proceso ausente, registro de procedencia de desarrollo ausente y archivo DPAPI ausente. Solo se comprobó su existencia en la ubicación documentada; no se buscaron claves de producción. Llamadas reales **0**, tokens reales **0**, coste de proveedor **0**. No hay una tasa de errores del proveedor ni una valoración humana realizada.

Se reutilizaron seis conversaciones ya conocidas: D02, D06, D07, D09, D11 y F01; 18 turnos de huésped por versión, Principal y Concierge separados: **36 turnos por versión y 54 invocaciones del SDK sustituido por versión**. Hubo tres pasadas acotadas del evaluador, incluida la intermedia conservada: 108 turnos de ruta y 162 invocaciones de SDK sustituido en total. La tabla compara únicamente la base y la última pasada. Ambas usan estados SQL inicialmente equivalentes en PostgreSQL 17.10 desechable, solo loopback. El generador posterior al guardado está sustituido por `null`; sus reglas se comprueban además en pruebas de comportamiento con salidas controladas. Esto verifica composición, persistencia y guardas; **no naturalidad del modelo**. Inbox se calcula antes de las escrituras y se comprueba su carácter de borrador sin efectos. No se ejecutó una nueva ronda extensa de diagnóstico ni se alteraron los fixtures anteriores.

| Dimensión | Antes `5768682` | Corrección | Alcance |
| --- | --- | --- | --- |
| Propiedades operativas fallidas | 0/36 | 0/36 | Casos sintéticos, no tasa del modelo |
| D02 pregunta otra vez la fecha | 2/2 respuestas iniciales | 0/2 | Una por ruta |
| D02 explica directamente edificio frente a habitación en el seguimiento | No, 0/2 | Sí, 2/2 | Lectura editorial del agente |
| Cantidad sin artículo en D07/F01 | 4/4 aclaraciones | 0/4 | Recibo comprobado |
| Progreso abierto D07/D11 con sujeto explícito y estado pendiente | 0/4 | 4/4 | No afirma novedad ni actuación |
| D02 extensión inicial | 85 palabras | 68 palabras | La conversación completa pasa de 108 a 105; brevedad no demuestra utilidad |
| Repetición exacta | 0/36 | 0/36 | 24 pares comparables; no hay mejora de esta métrica que atribuir al cambio |
| Novedades, envíos o entrega ficticios detectados | 0/36 | 0/36 | Guardas acotadas, no prueba universal |

La lectura editorial distingue intención, contexto, siguiente paso, derivación y estilo. D02 mejora la precisión de la siguiente acción; las cantidades dejan de ser números sin objeto. D06 sigue sin poder resolver una política contradictoria o la ubicación ausente del gimnasio: es una carencia de información del hotel, no se añadió Knowledge para aprobar. D11 conserva el fallo de guardado visible, el reintento y la petición humana; su alternativa de atención inmediata es pertinente al fallo. D09 usa los cambios de estado persistidos por el personal sintético, no deducidos por el modelo. F01 conserva un residual anterior en el acuse inicial: dice «an extra pillow» aunque se pidieron dos; la descripción persistida conserva las dos y la aclaración posterior confirma cuatro. No se declara resuelta toda la precisión/naturalidad del motor.

Se conservan las seis conversaciones completas en [six-before-after.md](evidence/service-arrival-correction/six-before-after.md), los prompts, probes, salida original sustituida, finales, transformaciones, errores, tickets y recibos en `before.json.gz`, `after-first.json.gz` y `after-final.json.gz`. La primera respuesta corregida repetía el mismo párrafo en los turnos 2 y 3 de D02; permanece en `after-first`. La versión final distingue la nueva aclaración. El manifiesto incluye huellas del motor y de la reserva. Ninguna de estas salidas se presenta como llamada real.

## Reserva para evaluación real

Antes de modificar el motor se guardó `scripts/fixtures/guest-service-quality/arrival-naturalness-real-reserve.json`: R01–R03, nueve turnos, los mismos dos hoteles ficticios con las políticas originales. SHA-256 canónico LF `329223069d3a7565fecfa703c989da9a07a2e5be0ae406296970bc95b95af939`.

**No ejecutada: 0/3 conversaciones**, tampoco con dobles. Sigue reservada; no hay resultados ni porcentaje favorable. Las muestras anteriores, incluido F01, son regresiones. Si sus futuras respuestas motivan cambios dejará de ser independiente.

Para la evaluación real: comparar primero el motor intacto de `5768682` con esta corrección, en catálogos independientes equivalentes, sin reutilizar su salida como si la hubiese generado el nuevo motor. Modelo previsto del producto `gpt-4.1-mini`; Principal usa `OPENAI_MODEL` o ese valor predeterminado; Concierge `AI_CONCIERGE_MODEL`, luego `OPENAI_MODEL`, luego ese valor; el redactor posterior usa el de Principal. No se inspeccionaron variables desplegadas. Los adaptadores usan Chat Completions y esquema JSON estricto, sin temperatura explícita. Debe fijarse el mismo modelo en ambas versiones y registrar la configuración efectiva, incluidos límites de salida.

Presupuesto comunicado para la próxima comparación: **270 intentos como máximo, 2.160.000 tokens, sin reintentos automáticos**. Corresponde a 18 turnos conocidos y nueve reservados en ambas versiones, hasta cinco generaciones por turno sumando Principal, Concierge y composición posterior. Reservar antes de cada llamada un máximo conservador de entrada y salida; rechazar una entrada que exceda la reserva, no truncar hechos. Un timeout sin `usage` consume la reserva y se identifica como uso desconocido. Inbox continúa siendo determinista. Falta construir/ejecutar el transporte real aislado cuando exista la credencial; el evaluador de dobles no tiene acceso a ella.

## Comprobaciones

- PASS: `test:arrival-booking-quality` (16 grupos), nuevo `test:arrival-turn-context` (8 grupos más filtro posterior al guardado), `test:service-turn-naturalness`, `test:service-evidence-followups`, `test:guest-service-quality`, `test:guest-final-output`, `test:guest-service-receipts`, `test:attention-lifecycle`, `test:operational-requests`, `test:pilot-human-safety`.
- Nuevo test incorporado a `ci:critical`. Las regresiones PostgreSQL existentes de CI conservan los casos completos. Se añade el selector `arrival-targeted` al evaluador para esta comprobación local acotada. GitHub CI no ejecutado.
- PostgreSQL: 36 turnos finales por versión, 0 fallos de las propiedades comprobadas, ningún intento externo. Contenedor no necesario: runtime nativo desechable ya disponible. Se conserva su límite anterior: sin prueba de durabilidad ante caída del sistema.
- Replays de generaciones históricas pasan; sus logs conservan los conteos históricos, **no son llamadas nuevas**. Se actualizan únicamente las expectativas del texto de progreso solicitado; las fuentes y salidas históricas no se reescriben.
- Un replay detectó un seguimiento de habitación demasiado largo: se corrigió el reconocimiento de «podemos entrar ya en la habitación» y se conserva el límite original de 250 caracteres. No se relajó ese control.
- Fallo heredado separado: `test:guest-ai-tenant-isolation` espera una consulta directa `withHotel(supabase.from('ai_logs'))` en el Dashboard ejecutivo. El código actual delega su carga. Se reprodujo exactamente en la copia de `5768682`; no se modifica ni se declara aprobado. Las comprobaciones de ámbito del nuevo test, recibos y peticiones operativas sí pasan.
- Sintaxis: 449 archivos PASS; build aislado del Dashboard PASS; `git diff --check` PASS. Logs y resultados intermedios conservados.

## Pendientes y siguiente paso

Listo para revisar **el cambio local**, no para decidir la publicación basándose en conversaciones reales: esa evaluación falta. No se implementan cancelación efectiva ni gestión atómica de varias solicitudes independientes; requieren trabajo de herramientas/persistencia aparte. Tampoco se verifica una coordinación individual que el contrato no representa ni se resuelven políticas ausentes/contradictorias mediante redacción. Queda el residual inicial de F01 indicado arriba.

Para habilitar la evaluación, ejecutar desde PowerShell del usuario:

```powershell
& 'C:\Users\chimi\OneDrive\Documentos\New project\.npm-cache\guest-service-quality-evaluation\worktree\scripts\configure-development-evaluation.ps1' -ConfirmDevelopment
```

Introducir el ID de un proyecto de desarrollo y una clave **nueva** únicamente en el campo oculto del terminal. Se cifra mediante DPAPI fuera de Git/OneDrive; no pegarla en la conversación. Procedimiento: [guest-service-development-access.md](guest-service-development-access.md).

Producción, demo, datos, permisos y flags intactos: Guest Memory OFF y `SEND_AUTOMATIONS=false`. Sin migración, SQL remoto, envíos, push, PR, merge ni despliegue. Informes/inventarios previos y el worktree de Ubikos preservados.
